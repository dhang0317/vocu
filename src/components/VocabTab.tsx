import { parseVocabText, extractTextFromPdfFile } from '@/lib/vocabFileParser';
'use client';

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Filter,
  ArrowLeft,
  Pencil,
  Trash2,
  Upload,
  Sparkles,
  Play,
  X,
  Check,
  BookOpen,
  FileText,
  Search,
} from 'lucide-react';
import { useVocu } from '@/context/VocuContext';
import { SetIconKey, WordItem, WordSet } from '@/types/vocu';
import { TAG_COLORS, SET_ICONS } from '@/lib/seedData';
import { SetIcon, WeightStatusBadge } from './SetIcon';
import { analyzeWordPriority } from '@/lib/quizEngine';
import { generateLetterHintMask } from '@/lib/masking';

export function VocabTab() {
  const {
    wordSets,
    words,
    practiceLogs,
    quizBank,
    settings,
    addWordSet,
    updateWordSet,
    deleteWordSet,
    addWord,
    updateWord,
    deleteWord,
    batchImportWords,
    startQuiz,
  } = useVocu();

  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 新增/編輯單字集 Modal 狀態
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<WordSet | null>(null);
  const [setFormTitle, setSetFormTitle] = useState('');
  const [setFormColor, setSetFormColor] = useState<string>(TAG_COLORS[0].hex);
  const [setFormIcon, setSetFormIcon] = useState<SetIconKey>('book');

  // 單字集內頁的子頁籤 ('words' | 'quizzes')
  const [detailSubTab, setDetailSubTab] = useState<'words' | 'quizzes'>('words');
  const [visibleWordCount, setVisibleWordCount] = useState(30);
  const [visibleQuizCount, setVisibleQuizCount] = useState(30);

  // 新增/編輯單字表單狀態
  const [isWordFormOpen, setIsWordFormOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<WordItem | null>(null);
  const [wordTerm, setWordTerm] = useState('');
  const [wordPos, setWordPos] = useState('n.');
  const [wordDef, setWordDef] = useState('');

  // 批次匯入單字 Modal 狀態
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);

  const selectedSet = useMemo(
    () => wordSets.find((s) => s.id === selectedSetId) || null,
    [wordSets, selectedSetId]
  );

  const filteredSets = useMemo(() => {
    return wordSets.filter((s) => {
      if (colorFilter !== 'all' && s.color !== colorFilter) return false;
      if (
        searchQuery.trim() &&
        !s.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [wordSets, colorFilter, searchQuery]);

  const openCreateSetModal = () => {
    setEditingSet(null);
    setSetFormTitle('');
    setSetFormColor(TAG_COLORS[0].hex);
    setSetFormIcon('book');
    setIsSetModalOpen(true);
  };

  const openEditSetModal = (set: WordSet, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSet(set);
    setSetFormTitle(set.title);
    setSetFormColor(set.color);
    setSetFormIcon(set.icon);
    setIsSetModalOpen(true);
  };

  const handleSaveSet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setFormTitle.trim()) return;
    if (editingSet) {
      updateWordSet(editingSet.id, {
        title: setFormTitle,
        color: setFormColor,
        icon: setFormIcon,
      });
    } else {
      addWordSet({
        title: setFormTitle,
        color: setFormColor,
        icon: setFormIcon,
      });
    }
    setIsSetModalOpen(false);
  };

  const openCreateWordForm = () => {
    setEditingWord(null);
    setWordTerm('');
    setWordPos('n.');
    setWordDef('');
    setIsWordFormOpen(true);
  };

  const openEditWordForm = (word: WordItem) => {
    setEditingWord(word);
    setWordTerm(word.term);
    setWordPos(word.pos);
    setWordDef(word.definition);
    setIsWordFormOpen(true);
  };

  const handleSaveWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSet || !wordTerm.trim() || !wordDef.trim()) return;
    if (editingWord) {
      updateWord(editingWord.id, {
        term: wordTerm,
        pos: wordPos,
        definition: wordDef,
      });
    } else {
      addWord({
        setId: selectedSet.id,
        term: wordTerm,
        pos: wordPos,
        definition: wordDef,
      });
    }
    setIsWordFormOpen(false);
    setEditingWord(null);
    setWordTerm('');
    setWordDef('');
  };

  const handleBatchImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSet || !batchText.trim()) return;
    // 支援每行格式：`term | pos | definition` 或 `term, pos, definition` 或 `term - definition`
    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedItems = parseVocabText(batchText);

    const count = batchImportWords(selectedSet.id, parsedItems);
    if (count > 0) {
      setBatchFeedback(`成功匯入 ${count} 筆單字／片語！`);
      setBatchText('');
      setTimeout(() => {
        setBatchFeedback(null);
        setIsBatchModalOpen(false);
      }, 1100);
    } else {
      setBatchFeedback('無法辨識出「英文單字 + 中文釋義」，請確認內容格式。');
    }
  };

  const handleVocabFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBatchFeedback(`正在解析 ${file.name}...`);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      const extractedText = isPdf ? await extractTextFromPdfFile(file) : await file.text();
      const preview = parseVocabText(extractedText);
      setBatchText(extractedText);
      if (preview.length > 0) {
        setBatchFeedback(`已從 ${file.name} 辨識出 ${preview.length} 筆單字／片語，請確認後點擊「確認匯入」。`);
      } else {
        setBatchFeedback(`已讀取 ${file.name}，但未自動偵測到單字格式，可手動微調後匯入。`);
      }
    } catch (err) {
      setBatchFeedback(`檔案解析失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ==========================================
  // 單字集內頁 (Detail View)
  // ==========================================
  if (selectedSet) {
    const setWords = words.filter((w) => w.setId === selectedSet.id);
    const setQuizzes = quizBank.filter((q) => q.setId === selectedSet.id);

    return (
      <div className="space-y-6 pb-24">
        {/* Top Back Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setSelectedSetId(null)}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回我的單字集列表</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openEditSetModal(selectedSet)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#000000] hover:bg-white/10 border border-white/10 text-xs text-zinc-300 transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>編輯單字集</span>
            </button>
            <button
              onClick={() => {
                deleteWordSet(selectedSet.id);
                setSelectedSetId(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#000000] hover:bg-[#F472B6]/15 border border-white/10 hover:border-[#F472B6]/40 text-xs text-zinc-400 hover:text-[#F472B6] transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>刪除</span>
            </button>
          </div>
        </div>

        {/* Set Header Card */}
        <div className="bg-[#000000] border border-white/10 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: `${selectedSet.color}20`,
                  color: selectedSet.color,
                }}
              >
                <SetIcon icon={selectedSet.icon} className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-white">{selectedSet.title}</h1>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  共 {setWords.length} 個單字與片語 • 已生成 {setQuizzes.length} 組 AI 語境題目
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  startQuiz({
                    setId: selectedSet.id,
                    questionType: 'word_bank_cloze',
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#000000] hover:bg-white/5 border border-white/15 text-xs font-semibold text-white transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-zinc-300" />
                <span>測驗文意選填</span>
              </button>
              <button
                onClick={() =>
                  startQuiz({
                    setId: selectedSet.id,
                    questionType: 'letter_hint_cloze',
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-[#000000]" />
                <span>測驗文意字彙</span>
              </button>
            </div>
          </div>

          {/* Sub-navigation & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-white/10">
            <div className="inline-flex p-1 rounded-xl bg-[#000000] border border-white/10">
              <button
                onClick={() => setDetailSubTab('words')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  detailSubTab === 'words'
                    ? 'bg-white text-[#000000]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                單字與片語 ({setWords.length})
              </button>
              <button
                onClick={() => setDetailSubTab('quizzes')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  detailSubTab === 'quizzes'
                    ? 'bg-white text-[#000000]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                已生成的題目 ({setQuizzes.length})
              </button>
            </div>

            {detailSubTab === 'words' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBatchFeedback(null);
                    setIsBatchModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#000000] hover:bg-white/5 border border-white/10 text-xs font-medium text-zinc-200 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-300" />
                  <span>批次匯入</span>
                </button>
                <button
                  onClick={openCreateWordForm}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新增單字 / 片語</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline Add/Edit Word Form */}
        {isWordFormOpen && (
          <form
            onSubmit={handleSaveWord}
            className="bg-[#000000] border border-white/30 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {editingWord ? '編輯單字 / 片語' : '新增單字 / 片語'}
              </h3>
              <button
                type="button"
                onClick={() => setIsWordFormOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-xs text-zinc-400 mb-1">
                  單字或片語 (term) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：mystery 或 nowhere to be found"
                  value={wordTerm}
                  onChange={(e) => setWordTerm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-sm text-white focus:outline-none focus:border-white/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">詞性 (pos)</label>
                <select
                  value={wordPos}
                  onChange={(e) => setWordPos(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-sm text-white focus:outline-none focus:border-white/50"
                >
                  <option value="n.">n. 名詞</option>
                  <option value="v.">v. 動詞</option>
                  <option value="adj.">adj. 形容詞</option>
                  <option value="adv.">adv. 副詞</option>
                  <option value="phr.">phr. 片語</option>
                  <option value="v./n.">v./n.</option>
                </select>
              </div>
              <div className="sm:col-span-5">
                <label className="block text-xs text-zinc-400 mb-1">
                  中文釋義 (definition) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：到處都找不到；不知去向"
                  value={wordDef}
                  onChange={(e) => setWordDef(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-sm text-white focus:outline-none focus:border-white/50"
                />
              </div>
            </div>
            {wordTerm.trim() && (
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <span>文意字彙自動首尾字母遮罩預覽：</span>
                <code className="px-2 py-0.5 rounded bg-[#000000] text-zinc-300 font-mono">
                  {generateLetterHintMask(wordTerm)}
                </code>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsWordFormOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#000000] text-xs text-zinc-300 hover:bg-white/5 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-white text-[#000000] text-xs font-bold hover:brightness-105 cursor-pointer"
              >
                儲存字詞
              </button>
            </div>
          </form>
        )}

        {/* Sub-tab 1: 單字與片語列表 */}
        {detailSubTab === 'words' ? (
          setWords.length === 0 ? (
            <div className="bg-[#000000] border border-white/10 rounded-2xl p-10 text-center">
              <BookOpen className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">此單字集尚無單字</h3>
              <p className="text-xs text-zinc-400 mb-5">
                點擊上方「新增單字 / 片語」或「批次匯入」開始建立你的專屬字庫。
              </p>
              <button
                onClick={openCreateWordForm}
                className="px-5 py-2.5 rounded-xl bg-white text-[#000000] text-xs font-bold cursor-pointer"
              >
                + 新增第一個單字
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {setWords.slice(0, visibleWordCount).map((word) => {
                const priority = analyzeWordPriority(
                  word,
                  practiceLogs,
                  settings.cooldownThreshold
                );
                return (
                  <div
                    key={word.id}
                    className="bg-[#000000] border border-white/10 hover:border-white/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-base font-bold text-white">{word.term}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#000000] text-zinc-400 border border-white/5">
                          {word.pos}
                        </span>
                        <WeightStatusBadge status={priority.status} />
                        <span className="text-[11px] font-mono text-zinc-500">
                          遮罩: {generateLetterHintMask(word.term)}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300">{word.definition}</p>
                      <p className="text-[11px] text-zinc-500">{priority.reasonText}</p>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => openEditWordForm(word)}
                        className="p-2 rounded-xl bg-[#000000] hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 transition cursor-pointer"
                        title="編輯單字"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteWord(word.id)}
                        className="p-2 rounded-xl bg-[#000000] hover:bg-[#F472B6]/15 text-zinc-400 hover:text-[#F472B6] border border-white/5 transition cursor-pointer"
                        title="刪除單字"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {setWords.length > visibleWordCount && (
                <button
                  onClick={() => setVisibleWordCount((c) => c + 30)}
                  className="w-full py-3 rounded-2xl bg-[#000000] hover:bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300 transition cursor-pointer"
                >
                  顯示更多單字（目前顯示 {visibleWordCount} / 共 {setWords.length} 個）
                </button>
              )}
            </div>
          )
        ) : (
          /* Sub-tab 2: 查看已生成的題目 */
          <div className="space-y-4">
            {setQuizzes.length === 0 ? (
              <div className="bg-[#000000] border border-white/10 rounded-2xl p-8 text-center">
                <Sparkles className="w-9 h-9 text-zinc-300 mx-auto mb-2" />
                <h3 className="text-base font-bold text-white mb-1">
                  尚無預存題目，開始測驗時將自動動態生成
                </h3>
                <p className="text-xs text-zinc-400">
                  你也可以在「我 (Profile)」頁面透過 MCP 讓 Claude 助理為此單字集批次生成新題目。
                </p>
              </div>
            ) : (
              <>
                {setQuizzes.slice(0, visibleQuizCount).map((quiz) => {
                  const isAnswered = practiceLogs.some(
                    (l) => l.questionHash === quiz.questionHash
                  );
                  if (quiz.type === 'word_bank_cloze') {
                    return (
                      <div
                        key={quiz.id}
                        className="bg-[#000000] border border-white/10 rounded-2xl p-5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-zinc-300">
                              文意選填 (10 格短文)
                            </span>
                            <span className="text-sm font-bold text-white">{quiz.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-zinc-500">
                              {quiz.questionHash}
                            </span>
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                isAnswered
                                  ? 'bg-zinc-800 text-zinc-400'
                                  : 'bg-white/10 text-zinc-300'
                              }`}
                            >
                              {isAnswered ? '已作答過 (防重複已標記)' : '全新未作答'}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">
                          {quiz.passage}
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(quiz.options || []).map((opt) => (
                            <span
                              key={opt.letter}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-[#000000] border border-white/10 text-zinc-300"
                            >
                              ({opt.letter}) {opt.term}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={quiz.id}
                      className="bg-[#000000] border border-white/10 rounded-2xl p-5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#60A5FA]/15 text-[#60A5FA]">
                            {quiz.type === 'letter_hint_cloze'
                              ? '文意字彙 (首尾字母提示)'
                              : '單句克漏字 (四選一)'}
                          </span>
                          <span className="text-xs font-mono text-zinc-300">
                            {quiz.type === 'letter_hint_cloze'
                              ? `遮罩：${generateLetterHintMask(quiz.targetTerm)}`
                              : `答案：${quiz.correctLabel || ''}. ${quiz.targetTerm || ''}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-zinc-500">
                            {quiz.questionHash}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              isAnswered
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-white/10 text-zinc-300'
                            }`}
                          >
                            {isAnswered ? '已作答過 (防重複已標記)' : '全新未作答'}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {(quiz.sentence || '').replace(
                          '{{BLANK}}',
                          quiz.type === 'letter_hint_cloze'
                            ? `[ ${generateLetterHintMask(quiz.targetTerm || '')} ]`
                            : '________'
                        )}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {quiz.type === 'letter_hint_cloze'
                          ? `提示釋義：${quiz.chineseHint}（詞性：${quiz.pos}）`
                          : `正確答案：${quiz.correctLabel}. ${quiz.targetTerm}`}
                      </p>
                    </div>
                  );
                })}
                {setQuizzes.length > visibleQuizCount && (
                  <button
                    onClick={() => setVisibleQuizCount((c) => c + 30)}
                    className="w-full py-3 rounded-2xl bg-[#000000] hover:bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300 transition cursor-pointer"
                  >
                    顯示更多題目（目前顯示 {visibleQuizCount} / 共 {setQuizzes.length} 題）
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Batch Import Modal */}
        {isBatchModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#000000] border border-white/15 rounded-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">批次匯入單字與片語</h3>
                <button
                  onClick={() => setIsBatchModalOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  支援直接上傳檔案，或貼上多種格式（<code className="text-zinc-300">|</code>、逗號、Tab、編號清單、<code className="text-zinc-300">單字 (詞性) 中文</code> 等）：
                </p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>選擇檔案（PDF / TXT / CSV）</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.csv,.tsv,.md,application/pdf,text/plain,text/csv"
                    onChange={handleVocabFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <form onSubmit={handleBatchImport} className="space-y-4">
                <textarea
                  rows={6}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={`meticulous | adj. | 一絲不苟的；極為謹慎的\nmake ends meet | phr. | 使收支相抵；勉強維持生計\nbreakthrough | n. | 重大突破`}
                  className="w-full p-3.5 rounded-xl bg-[#000000] border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-white/50"
                />
                {batchFeedback && (
                  <p className="text-xs text-zinc-300 font-medium">{batchFeedback}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setBatchText(
                        `meticulous | adj. | 一絲不苟的；極為謹慎的\nmake ends meet | phr. | 使收支相抵；勉強維持生計\nbreakthrough | n. | 重大突破`
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#000000] border border-white/10 text-xs text-zinc-300 hover:text-white cursor-pointer mr-auto"
                  >
                    填入範例格式
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#000000] text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-white text-[#000000] text-xs font-bold hover:brightness-105 cursor-pointer"
                  >
                    確認匯入
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Re-use Set Modal when editing from detail view */}
        {isSetModalOpen && renderSetModal()}
      </div>
    );
  }

  // ==========================================
  // 新增/編輯單字集 Modal Helper
  // ==========================================
  function renderSetModal() {
    return (
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-[#000000] border border-white/15 rounded-2xl max-w-md w-full p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">
              {editingSet ? '編輯單字集' : '新增單字集'}
            </h3>
            <button
              onClick={() => setIsSetModalOpen(false)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveSet} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                單字集名稱 *
              </label>
              <input
                type="text"
                required
                placeholder="例如：TOEFL 核心高頻單字 & 片語"
                value={setFormTitle}
                onChange={(e) => setSetFormTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-sm text-white focus:outline-none focus:border-white/50"
              />
            </div>

            {/* 5 種標籤輔助色選擇 */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                選擇標籤顏色（5 色）
              </label>
              <div className="flex items-center gap-3">
                {TAG_COLORS.map((c) => {
                  const selected = setFormColor === c.hex;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSetFormColor(c.hex)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform cursor-pointer ${
                        selected ? 'scale-110 ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {selected && <Check className="w-4 h-4 text-[#000000] stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6 種線條圖示選擇 */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                選擇線條圖示（6 款）
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {SET_ICONS.map((ic) => {
                  const selected = setFormIcon === ic.key;
                  return (
                    <button
                      key={ic.key}
                      type="button"
                      onClick={() => setSetFormIcon(ic.key)}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium transition cursor-pointer ${
                        selected
                          ? 'bg-[#000000] border-white text-white'
                          : 'bg-[#000000]/60 border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <SetIcon
                        icon={ic.key}
                        className="w-4 h-4 shrink-0"
                        style={{ color: selected ? setFormColor : undefined }}
                      />
                      <span>{ic.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSetModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#000000] text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-white text-[#000000] text-xs font-bold hover:brightness-105 cursor-pointer"
              >
                {editingSet ? '儲存變更' : '建立單字集'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // 我的單字集列表 (Master View)
  // ==========================================
  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-300 mb-1">
            VOCABULARY COLLECTIONS
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">我的單字集</h1>
          <p className="text-sm text-zinc-400 mt-1">
            點擊任一單字集管理單字與片語、查看自動首尾字母遮罩與 AI 題庫
          </p>
        </div>

        <button
          id="create-wordset-btn"
          onClick={openCreateSetModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] font-bold text-xs shadow-sm transition cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>新增單字集</span>
        </button>
      </header>

      {/* WordSet Cards Grid */}
      {filteredSets.length === 0 ? (
        <div className="bg-[#000000] border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-sm text-zinc-400 mb-4">找不到符合篩選條件的單字集</p>
          <button
            onClick={openCreateSetModal}
            className="px-5 py-2.5 rounded-xl bg-white text-[#000000] text-xs font-bold cursor-pointer"
          >
            + 新增單字集
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredSets.map((set) => {
            const setWords = words.filter((w) => w.setId === set.id);
            const weakCount = setWords.filter(
              (w) =>
                analyzeWordPriority(w, practiceLogs, settings.cooldownThreshold).status ===
                'weakness'
            ).length;
            const untestedCount = setWords.filter(
              (w) =>
                analyzeWordPriority(w, practiceLogs, settings.cooldownThreshold).status ===
                'untested'
            ).length;

            return (
              <div
                key={set.id}
                onClick={() => setSelectedSetId(set.id)}
                className="group bg-[#000000] border border-white/10 hover:border-white/40 rounded-2xl p-5 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center shrink-0">
                      <SetIcon icon={set.icon} className="w-6 h-6" />
                    </div>
                    <button
                      onClick={(e) => openEditSetModal(set, e)}
                      className="p-2 rounded-xl bg-[#000000] opacity-80 group-hover:opacity-100 text-zinc-400 hover:text-white border border-white/5 transition"
                      title="編輯單字集"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h2 className="text-lg font-bold text-white group-hover:text-white transition-colors">
                    {set.title}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    共 <span className="text-white font-semibold">{setWords.length}</span> 個單字與片語
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    {weakCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#F472B6]/15 text-[#F472B6] font-medium">
                        {weakCount} 弱點優先
                      </span>
                    )}
                    {untestedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-medium">
                        {untestedCount} 未測驗
                      </span>
                    )}
                    {weakCount === 0 && untestedCount === 0 && (
                      <span className="text-zinc-500">進度良好</span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-zinc-300">管理單字 →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isSetModalOpen && renderSetModal()}
    </div>
  );
}
