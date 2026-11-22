'use client';

import React, { useState, useRef } from 'react';
import {
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  Terminal,
  Sliders,
  Database,
  Sparkles,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { useVocu } from '@/context/VocuContext';
import { formatRelativeTime } from '@/lib/quizEngine';
import { computeQuestionHash } from '@/lib/masking';

export function ProfileTab() {
  const {
    settings,
    updateSettings,
    wordSets,
    words,
    practiceLogs,
    quizBank,
    exportBackupJson,
    importBackupJson,
    addCustomQuizItem,
    resetToDemoData,
  } = useVocu();

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const liveMcpUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/mcp`
      : settings.mcpServerUrl;
  const [backupMessage, setBackupMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [mcpSimulatedMsg, setMcpSimulatedMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCopyMcpUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveMcpUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const claudeConfigJson = JSON.stringify(
    {
      mcpServers: {
        vocu: {
          command: 'npx',
          args: ['-y', '@vocu/mcp-bridge', '--url', liveMcpUrl],
        },
      },
    },
    null,
    2
  );

  const handleCopyClaudeConfig = async () => {
    try {
      await navigator.clipboard.writeText(claudeConfigJson);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  const handleExportJson = () => {
    const jsonStr = exportBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocu-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupMessage({
      type: 'success',
      text: '已成功匯出 JSON 備份檔案！',
    });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const res = importBackupJson(content);
      setBackupMessage({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    };
    reader.readAsText(file);
  };

  // 模擬 MCP Agent (Claude) 根據當前弱點單字推送一道全新語境題目進 Vocu 題庫
  const handleSimulateMcpPush = () => {
    const targetWord =
      words.find((w) => w.wrongCount > 0) || words[0];
    if (!targetWord) return;

    const newSentence = `In a recent MCP-assisted study session, researchers demonstrated how understanding "${'{{BLANK}}'}" can significantly accelerate mastery when reviewing real-world contexts [Agent Push #${quizBank.length + 1}].`;
    const hash = computeQuestionHash(`${targetWord.id}:${newSentence}`);

    addCustomQuizItem({
      id: `quiz-mcp-${Date.now()}`,
      setId: targetWord.setId,
      type: 'letter_hint_cloze',
      wordId: targetWord.id,
      sentence: newSentence,
      targetTerm: targetWord.term,
      baseTerm: targetWord.term,
      pos: targetWord.pos,
      chineseHint: targetWord.definition,
      explanation: `此題由已連線的 Claude MCP 助理讀取你的錯題記錄後即時生成，專注強化「${targetWord.term} (${targetWord.definition})」。`,
      questionHash: hash,
      createdAt: new Date().toISOString(),
      source: 'mcp_agent',
    });

    setMcpSimulatedMsg(
      `已接收 Claude MCP 推送的全新語境題目（目標字詞：${targetWord.term}，雜湊：${hash}）！`
    );
    setTimeout(() => setMcpSimulatedMsg(null), 5000);
  };

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-[#7CE3B3] mb-1">
          PROFILE, STRATEGY & MCP AGENT
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          個人設定與 AI 助理連線
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          管理你的帳號同步、動態防重複出題參數、JSON 備份以及 MCP Server 串接
        </p>
      </header>

      {/* 3. Agent 連線（MCP Server 設定區） */}
      <section className="bg-[#000000] border border-[#7CE3B3]/40 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7CE3B3]/15 text-[#7CE3B3] flex items-center justify-center shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  Agent 連線（MCP Server 設定區）
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#7CE3B3]/20 text-[#7CE3B3]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7CE3B3] animate-pulse" />
                  已連線
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                已連線助理：<span className="text-white font-medium">{settings.mcpConnectedAgent}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleSimulateMcpPush}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7CE3B3]/15 hover:bg-[#7CE3B3]/25 border border-[#7CE3B3]/40 text-[#7CE3B3] text-xs font-semibold transition cursor-pointer self-start sm:self-center"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>模擬 AI 助理推送新題目</span>
          </button>
        </div>

        {/* 核心說明 */}
        <div className="p-4 rounded-xl bg-[#000000] border border-white/10 text-xs text-zinc-300 leading-relaxed">
          讓 Claude 等 AI 助理讀取你的單字集與作答記錄並幫你出題，題目由助理產生，Vocu 只負責儲存與測驗。
        </div>

        {mcpSimulatedMsg && (
          <div className="p-3.5 rounded-xl bg-[#7CE3B3]/15 border border-[#7CE3B3]/40 text-xs text-[#7CE3B3] font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{mcpSimulatedMsg}</span>
          </div>
        )}

        {/* 專屬 MCP Server URL + 一鍵複製按鈕 */}
        <div>
          <label className="block text-xs font-semibold text-zinc-300 mb-2">
            專屬 MCP Server URL（SSE Endpoint）
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl bg-[#000000] border border-white/15 font-mono text-xs text-[#7CE3B3] select-all overflow-x-auto">
              {settings.mcpServerUrl}
            </div>
            <button
              id="copy-mcp-url-btn"
              onClick={handleCopyMcpUrl}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#7CE3B3] hover:brightness-105 text-[#000000] font-bold text-xs transition cursor-pointer shrink-0"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>已複製 URL</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>一鍵複製 URL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Claude Desktop 設定檔範例與開放 Tools 說明 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-[#000000] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                Claude Desktop 設定片段
              </span>
              <button
                onClick={handleCopyClaudeConfig}
                className="text-[11px] text-[#7CE3B3] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedConfig ? '已複製 JSON' : '複製設定'}
              </button>
            </div>
            <pre className="text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed">
              {claudeConfigJson}
            </pre>
          </div>

          <div className="p-4 rounded-xl bg-[#000000] border border-white/10 space-y-2">
            <span className="text-xs font-semibold text-zinc-300 block">
              MCP Server 暴露之 AI 工具介面
            </span>
            <ul className="space-y-1.5 text-xs text-zinc-400 font-mono">
              <li className="flex items-center justify-between">
                <span className="text-[#7CE3B3]">vocu.get_word_sets</span>
                <span className="text-[11px] font-sans text-zinc-500">讀取單字集與字詞</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#7CE3B3]">vocu.get_weak_words</span>
                <span className="text-[11px] font-sans text-zinc-500">取得錯題與權重佇列</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#7CE3B3]">vocu.check_question_hash</span>
                <span className="text-[11px] font-sans text-zinc-500">驗證題幹是否已做過</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#7CE3B3]">vocu.push_quiz_items</span>
                <span className="text-[11px] font-sans text-zinc-500">寫入新生成的語境題目</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. 資料與備份 (JSON 匯出 / 匯入) */}
      <section className="bg-[#000000] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-[#7CE3B3]" />
            <div>
              <h2 className="text-lg font-bold text-white">資料與備份</h2>
              <p className="text-xs text-zinc-400">
                將所有單字集 ({wordSets.length})、字詞 ({words.length})、作答記錄 ({practiceLogs.length}) 與題庫匯出或還原為 JSON 檔案
              </p>
            </div>
          </div>
        </div>

        {backupMessage && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border ${
              backupMessage.type === 'success'
                ? 'bg-[#7CE3B3]/15 border-[#7CE3B3]/40 text-[#7CE3B3]'
                : 'bg-[#F472B6]/15 border-[#F472B6]/40 text-[#F472B6]'
            }`}
          >
            {backupMessage.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            id="export-json-btn"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7CE3B3] hover:brightness-105 text-[#000000] font-bold text-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>匯出 JSON 備份檔</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          <button
            id="import-json-btn"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#000000] hover:bg-white/5 border border-white/15 text-xs font-semibold text-white transition cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#7CE3B3]" />
            <span>從 JSON 檔案匯入還原</span>
          </button>

          <button
            onClick={() => {
              resetToDemoData();
              setBackupMessage({
                type: 'success',
                text: '已重置為內建範例單字集、題庫與預設作答記錄！',
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#000000] hover:bg-[#F472B6]/15 border border-white/10 hover:border-[#F472B6]/40 text-xs font-medium text-zinc-400 hover:text-[#F472B6] transition cursor-pointer ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置範例資料</span>
          </button>
        </div>
      </section>
    </div>
  );
}
