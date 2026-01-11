import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { documentStorage } from '@/lib/graphrag';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    console.log('[GraphRAG Documents API] Request received');

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      console.error('[GraphRAG Documents API] No authorization header');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[GraphRAG Documents API] Auth header present:', authHeader.substring(0, 20) + '...');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxxxxxxxxxx.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MjAsImV4cCI6MTk2MDc2ODgyMH0.M1YwMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE';

    // Create Supabase client WITH auth header (required for RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    console.log('[GraphRAG Documents API] Supabase client created with auth');

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[GraphRAG Documents API] Auth error:', authError?.message);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[GraphRAG Documents API] User authenticated:', user.id);

    const documents = await documentStorage.getUserDocuments(supabase, user.id);

    console.log('[GraphRAG Documents API] Documents retrieved:', {
      count: documents.length,
      documents: documents.map(d => ({ id: d.id, filename: d.filename, processed: d.processed }))
    });

    return NextResponse.json({
      documents,
      total: documents.length,
    });
  } catch (error) {
    console.error('[GraphRAG Documents API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
