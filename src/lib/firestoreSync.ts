import { doc, getDoc, setDoc } from 'firebase/firestore';
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

export async function saveWorkspaceToFirestore(data: VocuWorkspaceDoc): Promise<boolean> {
  try {
    const ref = doc(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID);
    await setDoc(ref, data, { merge: true });
    return true;
  } catch (err) {
    console.error('Firestore save error:', err);
    return false;
  }
}
