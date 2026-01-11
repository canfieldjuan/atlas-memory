/**
 * Traversal Service Unit Tests
 * Tests for multi-hop graph traversal functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment
vi.stubGlobal('process', {
  env: {
    GRAPHITI_API_URL: 'http://localhost:8001',
    GRAPHRAG_TRAVERSAL_MAX_HOPS: '3',
    GRAPHRAG_TRAVERSAL_TIMEOUT_MS: '10000',
  },
});

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  TraversalService,
  traversalService,
  type TraversalOptions,
  type ShortestPathOptions,
} from '../../graphiti/traversal-service';

describe('TraversalService', () => {
  let service: TraversalService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TraversalService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with environment config', () => {
      // Service is created, verify it works
      expect(service).toBeInstanceOf(TraversalService);
    });
  });

  describe('traverseGraph', () => {
    const defaultOptions: TraversalOptions = {
      startEntityName: 'TestEntity',
      maxHops: 2,
      direction: 'outgoing',
      groupId: 'user-123',
    };

    it('should make POST request to /traverse endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [] }),
      });

      await service.traverseGraph(defaultOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8001/traverse',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should include correct request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [] }),
      });

      await service.traverseGraph({
        startEntityName: 'Company',
        relationTypes: ['EMPLOYS', 'OWNS'],
        maxHops: 3,
        direction: 'both',
        groupId: 'group-456',
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.start_entity_name).toBe('Company');
      expect(body.relation_types).toEqual(['EMPLOYS', 'OWNS']);
      expect(body.max_hops).toBe(3);
      expect(body.direction).toBe('both');
      expect(body.group_id).toBe('group-456');
    });

    it('should respect max hops limit from config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [] }),
      });

      // Request more hops than config allows
      await service.traverseGraph({
        ...defaultOptions,
        maxHops: 10,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // Should be capped at config max (3)
      expect(body.max_hops).toBeLessThanOrEqual(3);
    });

    it('should return traversal result with paths', async () => {
      const mockPaths = [
        {
          steps: [
            { entity: { name: 'A', uuid: 'uuid-a' }, relation: null },
            { entity: { name: 'B', uuid: 'uuid-b' }, relation: { type: 'RELATES', fact: 'A relates to B' } },
          ],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: mockPaths }),
      });

      const result = await service.traverseGraph(defaultOptions);

      expect(result.paths).toHaveLength(1);
      expect(result.queryTimeMs).toBeDefined();
      expect(typeof result.queryTimeMs).toBe('number');
    });

    it('should map API paths to internal format', async () => {
      const mockPaths = [
        {
          steps: [
            { entity: { name: 'Entity1', uuid: 'e1', labels: ['Person'] } },
            {
              entity: { name: 'Entity2', uuid: 'e2', labels: ['Company'] },
              relation: { type: 'WORKS_FOR', fact: 'Person works for Company', uuid: 'r1' },
            },
          ],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: mockPaths }),
      });

      const result = await service.traverseGraph(defaultOptions);

      expect(result.paths[0].path).toHaveLength(2);
      expect(result.paths[0].path[0].entity.name).toBe('Entity1');
      expect(result.paths[0].path[1].relation?.type).toBe('WORKS_FOR');
    });

    it('should calculate path length correctly', async () => {
      const mockPaths = [
        {
          steps: [
            { entity: { name: 'A', uuid: 'a' } },
            { entity: { name: 'B', uuid: 'b' }, relation: { type: 'R1', fact: '' } },
            { entity: { name: 'C', uuid: 'c' }, relation: { type: 'R2', fact: '' } },
          ],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: mockPaths }),
      });

      const result = await service.traverseGraph(defaultOptions);

      // 3 nodes = 2 edges = length 2
      expect(result.paths[0].length).toBe(2);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      await expect(service.traverseGraph(defaultOptions)).rejects.toThrow('Traversal API error');
    });

    it('should handle empty paths response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [] }),
      });

      const result = await service.traverseGraph(defaultOptions);

      expect(result.paths).toEqual([]);
    });

    it('should handle missing paths in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await service.traverseGraph(defaultOptions);

      expect(result.paths).toEqual([]);
    });

    it('should default relationTypes to empty array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [] }),
      });

      await service.traverseGraph({
        startEntityName: 'Test',
        maxHops: 2,
        direction: 'outgoing',
        groupId: 'user-1',
        // No relationTypes specified
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.relation_types).toEqual([]);
    });
  });

  describe('findShortestPath', () => {
    const defaultOptions: ShortestPathOptions = {
      startEntity: 'EntityA',
      endEntity: 'EntityB',
      groupId: 'user-123',
    };

    it('should make POST request to /shortest-path endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: null }),
      });

      await service.findShortestPath(defaultOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8001/shortest-path',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include correct request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: null }),
      });

      await service.findShortestPath({
        startEntity: 'Start',
        endEntity: 'End',
        groupId: 'group-1',
        maxHops: 4,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.start_entity).toBe('Start');
      expect(body.end_entity).toBe('End');
      expect(body.group_id).toBe('group-1');
    });

    it('should return found=true when path exists', async () => {
      const mockPath = {
        steps: [
          { entity: { name: 'A', uuid: 'a' } },
          { entity: { name: 'B', uuid: 'b' }, relation: { type: 'R', fact: 'fact' } },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: mockPath }),
      });

      const result = await service.findShortestPath(defaultOptions);

      expect(result.found).toBe(true);
      expect(result.path).not.toBeNull();
    });

    it('should return found=false when no path exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: null }),
      });

      const result = await service.findShortestPath(defaultOptions);

      expect(result.found).toBe(false);
      expect(result.path).toBeNull();
    });

    it('should handle 404 response as no path found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.findShortestPath(defaultOptions);

      expect(result.found).toBe(false);
      expect(result.path).toBeNull();
    });

    it('should throw on other error status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      await expect(service.findShortestPath(defaultOptions)).rejects.toThrow('Shortest path API error');
    });

    it('should include query time in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: null }),
      });

      const result = await service.findShortestPath(defaultOptions);

      expect(result.queryTimeMs).toBeDefined();
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatAsContext', () => {
    it('should return empty string for no paths', () => {
      const result = service.formatAsContext({ paths: [], queryTimeMs: 10 });
      expect(result).toBe('');
    });

    it('should format single path correctly', () => {
      const traversalResult = {
        paths: [
          {
            path: [
              { entity: { name: 'Alice', uuid: 'a' } },
              { entity: { name: 'Bob', uuid: 'b' }, relation: { type: 'KNOWS', fact: '' } },
            ],
            length: 1,
          },
        ],
        queryTimeMs: 50,
      };

      const context = service.formatAsContext(traversalResult);

      expect(context).toContain('Graph relationships:');
      expect(context).toContain('Path 1:');
      expect(context).toContain('Alice');
      expect(context).toContain('KNOWS');
      expect(context).toContain('Bob');
    });

    it('should format multiple paths', () => {
      const traversalResult = {
        paths: [
          {
            path: [
              { entity: { name: 'A', uuid: '1' } },
              { entity: { name: 'B', uuid: '2' }, relation: { type: 'R1', fact: '' } },
            ],
            length: 1,
          },
          {
            path: [
              { entity: { name: 'C', uuid: '3' } },
              { entity: { name: 'D', uuid: '4' }, relation: { type: 'R2', fact: '' } },
            ],
            length: 1,
          },
        ],
        queryTimeMs: 100,
      };

      const context = service.formatAsContext(traversalResult);

      expect(context).toContain('Path 1:');
      expect(context).toContain('Path 2:');
    });

    it('should use "related" as default relation type', () => {
      const traversalResult = {
        paths: [
          {
            path: [
              { entity: { name: 'X', uuid: 'x' } },
              { entity: { name: 'Y', uuid: 'y' }, relation: undefined },
            ],
            length: 1,
          },
        ],
        queryTimeMs: 10,
      };

      const context = service.formatAsContext(traversalResult);

      expect(context).toContain('related');
    });
  });

  describe('Path Mapping', () => {
    it('should handle empty steps array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [{ steps: [] }] }),
      });

      const result = await service.traverseGraph({
        startEntityName: 'Test',
        maxHops: 2,
        direction: 'outgoing',
        groupId: 'user-1',
      });

      expect(result.paths[0].path).toEqual([]);
      expect(result.paths[0].length).toBe(0);
    });

    it('should handle missing entity properties', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          paths: [{
            steps: [{ entity: {} }],
          }],
        }),
      });

      const result = await service.traverseGraph({
        startEntityName: 'Test',
        maxHops: 2,
        direction: 'outgoing',
        groupId: 'user-1',
      });

      expect(result.paths[0].path[0].entity.name).toBe('');
      expect(result.paths[0].path[0].entity.uuid).toBe('');
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(traversalService).toBeInstanceOf(TraversalService);
    });
  });

  describe('Timeout Handling', () => {
    it('should include AbortSignal with timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paths: [] }),
      });

      await service.traverseGraph({
        startEntityName: 'Test',
        maxHops: 2,
        direction: 'outgoing',
        groupId: 'user-1',
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].signal).toBeDefined();
    });
  });
});
