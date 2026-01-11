import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { documentService } from '@/lib/graphrag';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const rawId = params?.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxxxxxxxxxx.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MjAsImV4cCI6MTk2MDc2ODgyMH0.M1YwMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await documentService.deleteDocument(supabase, id, {
      deleteFromStorage: true,
      deleteFromNeo4j: true,
    });

    return NextResponse.json({
      success: true,
      id,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      {
        error: 'Delete failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
