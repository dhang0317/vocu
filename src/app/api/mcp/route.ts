import { NextRequest, NextResponse } from 'next/server';
import {
  loadWorkspaceFromFirestore,
  saveWorkspaceToFirestore,
} from '@/lib/firestoreSync';
import {
  INITIAL_WORD_SETS,
  INITIAL_WORDS,
  INITIAL_PRACTICE_LOGS,
  INITIAL_QUIZ_BANK,
  INITIAL_USER_SETTINGS,
} from '@/lib/seedData';
import { analyzeWordPriority } from '@/lib/quizEngine';
import { computeQuestionHash } from '@/lib/masking';
import { QuizItem } from '@/types/vocu';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(
    {
      name: 'vocu-mcp-server',
      version: '1.0.0',
      protocol: 'Model Context Protocol (JSON-RPC 2.0 over HTTP)',
      firebaseProjectId: 'vocu-f0d55',
      status: 'ready',
      tools: [
        'get_word_sets',
        'get_weak_words',
        'check_question_hash',
        'push_quiz_items',
      ],
    },
    { headers: CORS_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, method, params } = body;

    if (method === 'initialize') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'Vocu MCP Server',
              version: '1.0.0',
            },
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (method === 'notifications/initialized') {
      return NextResponse.json({ jsonrpc: '2.0', id, result: {} }, { headers: CORS_HEADERS });
    }

    if (method === 'tools/list') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'get_word_sets',
                description: '讀取 Vocu 中的所有單字集與單字列表',
                inputSchema: {
                  type: 'object',
                  properties: {
                    setId: { type: 'string', description: '選填：指定單字集 ID' },
                  },
                },
              },
              {
                name: 'get_weak_words',
                description:
                  '讀取作答記錄並回傳「弱點優先」與「尚未測驗」的單字佇列，供 AI 助理出題',
                inputSchema: {
                  type: 'object',
                  properties: {
                    setId: { type: 'string', description: '選填：指定單字集 ID' },
                    limit: { type: 'number', description: '回傳筆數上限，預設 10' },
                  },
                },
              },
              {
                name: 'check_question_hash',
                description: '檢查題幹雜湊是否已存在於作答記錄中，避免重複出題',
                inputSchema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string', description: '題幹文字' },
                  },
                  required: ['text'],
                },
              },
              {
                name: 'push_quiz_items',
                description: '將 AI 助理生成的全新題目寫入 Vocu Firestore 題庫',
                inputSchema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      description: '符合 Vocu QuizItem 格式的題目陣列',
                      items: { type: 'object' },
                    },
                  },
                  required: ['items'],
                },
              },
              {
                name: 'add_words',
                description: '新增單字或片語到指定的 Vocu 單字集（若未指定 setId 則加入第一個單字集）',
                inputSchema: {
                  type: 'object',
                  properties: {
                    setId: { type: 'string', description: '選填：目標單字集 ID' },
                    words: {
                      type: 'array',
                      description: '要新增的單字陣列，每筆包含 term, pos, definition',
                      items: {
                        type: 'object',
                        properties: {
                          term: { type: 'string' },
                          pos: { type: 'string' },
                          definition: { type: 'string' },
                        },
                        required: ['term', 'definition'],
                      },
                    },
                  },
                  required: ['words'],
                },
              },
            ],
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      const workspace = (await loadWorkspaceFromFirestore()) || {
        wordSets: INITIAL_WORD_SETS,
        words: INITIAL_WORDS,
        practiceLogs: INITIAL_PRACTICE_LOGS,
        quizBank: INITIAL_QUIZ_BANK,
        settings: INITIAL_USER_SETTINGS,
        updatedAt: new Date().toISOString(),
      };

      if (toolName === 'get_word_sets') {
        const sets = args.setId
          ? workspace.wordSets.filter((s) => s.id === args.setId)
          : workspace.wordSets;
        const words = args.setId
          ? workspace.words.filter((w) => w.setId === args.setId)
          : workspace.words;

        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ wordSets: sets, words }, null, 2),
                },
              ],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      if (toolName === 'get_weak_words') {
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        const targetWords = args.setId
          ? workspace.words.filter((w) => w.setId === args.setId)
          : workspace.words;

        const cooldownThreshold = workspace.settings?.cooldownThreshold ?? 15;
        const analyzed = targetWords
          .map((w) => analyzeWordPriority(w, workspace.practiceLogs, cooldownThreshold))
          .sort((a, b) => a.priorityTier - b.priorityTier)
          .slice(0, limit);

        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(analyzed, null, 2),
                },
              ],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      if (toolName === 'check_question_hash') {
        const hash = computeQuestionHash(String(args.text || ''));
        const exists = workspace.practiceLogs.some((l) => l.questionHash === hash);
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ questionHash: hash, alreadyAnswered: exists }),
                },
              ],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      if (toolName === 'push_quiz_items') {
        const incoming = (Array.isArray(args.items) ? args.items : []) as QuizItem[];
        const updatedBank = [...incoming, ...workspace.quizBank];
        await saveWorkspaceToFirestore({
          ...workspace,
          quizBank: updatedBank,
          updatedAt: new Date().toISOString(),
        });

        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `成功寫入 ${incoming.length} 題至 Vocu Firestore 題庫。`,
                },
              ],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      if (toolName === 'add_words') {
        const targetSetId =
          typeof args.setId === 'string' && args.setId.trim()
            ? args.setId.trim()
            : workspace.wordSets[0]?.id || 'set-core-academic';
        const incomingWords = Array.isArray(args.words) ? args.words : [];
        const created = incomingWords
          .filter((w: { term?: string; definition?: string }) => w?.term && w?.definition)
          .map(
            (
              w: { term: string; pos?: string; definition: string },
              idx: number
            ) => ({
              id: `w-mcp-${Date.now()}-${idx}`,
              setId: targetSetId,
              term: String(w.term).trim(),
              pos: String(w.pos || 'n.').trim(),
              definition: String(w.definition).trim(),
              wrongCount: 0,
              consecutiveCorrect: 0,
              lastSeenAt: null,
            })
          );

        const updatedWords = [...created, ...workspace.words];
        await saveWorkspaceToFirestore({
          ...workspace,
          words: updatedWords,
          updatedAt: new Date().toISOString(),
        });

        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `成功新增 ${created.length} 筆單字至單字集 (${targetSetId})。`,
                },
              ],
            },
          },
          { headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      },
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: String(err) },
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
