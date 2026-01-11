import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface FeedbackRequest {
  sourceId: string;
  helpful: boolean;
  conversationId?: string;
  messageId?: string;
  factContent?: string;
  feedbackText?: string;
  confidenceScore?: number;
}

interface FeedbackRecord {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  source_id: string;
  fact_content: string | null;
  helpful: boolean;
  feedback_text: string | null;
  confidence_score: number | null;
  created_at: string;
}

/**
 * POST /api/graphrag/feedback
 * Submit feedback on a GraphRAG search result
 */
export async function POST(request: NextRequest) {
  try {
    const body: FeedbackRequest = await request.json();

    const { sourceId, helpful, conversationId, messageId, factContent, feedbackText, confidenceScore } = body;

    if (!sourceId || typeof helpful !== 'boolean') {
      return NextResponse.json(
        { error: 'sourceId and helpful (boolean) are required' },
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

    const { data: feedback, error: insertError } = await supabaseAdmin
      .from('graphrag_feedback')
      .insert({
        user_id: user.id,
        source_id: sourceId,
        helpful,
        conversation_id: conversationId || null,
        message_id: messageId || null,
        fact_content: factContent || null,
        feedback_text: feedbackText || null,
        confidence_score: confidenceScore || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert feedback:', insertError);
      return NextResponse.json(
        { error: 'Failed to save feedback', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedback,
    });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process feedback',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/graphrag/feedback
 * Get feedback history for a source or conversation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');
    const conversationId = searchParams.get('conversationId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

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

    let query = supabaseAdmin
      .from('graphrag_feedback')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceId) {
      query = query.eq('source_id', sourceId);
    }

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    const { data: feedbackList, error: queryError } = await query;

    if (queryError) {
      console.error('Failed to fetch feedback:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch feedback', details: queryError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      feedback: feedbackList,
      count: feedbackList?.length || 0,
    });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch feedback',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET feedback statistics for a source
 */
export async function getSourceStats(sourceId: string, userId: string): Promise<{
  totalFeedback: number;
  helpfulCount: number;
  helpfulPercentage: number;
}> {
  const { data, error } = await supabaseAdmin
    .from('graphrag_feedback')
    .select('helpful')
    .eq('source_id', sourceId)
    .eq('user_id', userId);

  if (error || !data) {
    return { totalFeedback: 0, helpfulCount: 0, helpfulPercentage: 0 };
  }

  const totalFeedback = data.length;
  const helpfulCount = data.filter(f => f.helpful).length;
  const helpfulPercentage = totalFeedback > 0 ? (helpfulCount / totalFeedback) * 100 : 0;

  return { totalFeedback, helpfulCount, helpfulPercentage };
}
