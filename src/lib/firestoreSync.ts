import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { WordSet, WordItem, PracticeLog, QuizItem, UserSettings } from '@/types/vocu';

export interface VocuWorkspaceDoc {
  wordSets: WordSet[];
  words: WordItem[];
  practiceLogs: PracticeLog[];
  quizBank: QuizItem[];
  settings?: UserSettings;
  updatedAt: string;
}

const WORKSPACE_COLLECTION = 'vocu_workspaces';
const DEFAULT_DOC_ID = 'default';

export async function loadWorkspaceFromFirestore(): Promise<VocuWorkspaceDoc | null> {
  try {
    const ref = doc(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as VocuWorkspaceDoc;
  } catch (err) {
    console.error('Firestore load error:', err);
    return null;
  }
}

export function subscribeWorkspaceFromFirestore(
  onUpdate: (data: VocuWorkspaceDoc) => void
): () => void {
  const ref = doc(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as VocuWorkspaceDoc);
      }
    },
    (err) => {
      console.error('Firestore snapshot error:', err);
    }
  );
}

export async function saveWorkspaceToFirestore(
  data: VocuWorkspaceDoc
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ref = doc(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID);
    const cleanData = JSON.parse(JSON.stringify(data));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timeout (10s)')), 10000)
    );
    await Promise.race([setDoc(ref, cleanData, { merge: true }), timeoutPromise]);
    return { ok: true };
  } catch (err) {
    console.error('Firestore save error:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
