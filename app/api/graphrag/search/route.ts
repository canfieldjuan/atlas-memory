import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { searchService } from '@/lib/graphrag';
// DEPRECATED: import { recordUsageEvent } from '@/lib/usage/checker';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { query, limit = parseInt(process.env.GRAPHRAG_SEARCH_DEFAULT_LIMIT || '10', 10) } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await searchService.search(query, user.id);

    // DEPRECATED: OLD usage tracking system
    // Now using usage_meters table via increment_root_trace_count()
    // await recordUsageEvent({
    //   userId: user.id,
    //   metricType: 'graphrag_search',
    //   value: 1,
    //   resourceType: 'graphrag_query',
    //   metadata: {
    //     queryLength: query.length,
    //     resultsCount: result.nodes?.length || 0,
    //     limit,
    //   },
    // });

    return NextResponse.json({
      ...result,
      query,
      limit,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      {
        error: 'Search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
