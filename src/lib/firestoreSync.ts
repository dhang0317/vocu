import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
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

export async function saveMcpQuizzesToSubcollection(
  items: QuizItem[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const colRef = collection(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID, 'quizzes');
    const CHUNK_SIZE = 450;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const cleanItem = JSON.parse(JSON.stringify(item));
        batch.set(doc(colRef, item.id), cleanItem, { merge: true });
      }
      await batch.commit();
    }
    return { ok: true };
  } catch (err) {
    console.error('Firestore subcollection save error:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function subscribeMcpQuizzesFromSubcollection(
  onUpdate: (items: QuizItem[]) => void
): () => void {
  const colRef = collection(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID, 'quizzes');
  return onSnapshot(
    colRef,
    (snap) => {
      const items: QuizItem[] = [];
      snap.forEach((d) => items.push(d.data() as QuizItem));
      onUpdate(items);
    },
    (err) => {
      console.error('Firestore subcollection snapshot error:', err);
    }
  );
}

export async function loadMcpQuizzesFromSubcollection(): Promise<QuizItem[]> {
  try {
    const colRef = collection(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID, 'quizzes');
    const snap = await getDocs(colRef);
    const items: QuizItem[] = [];
    snap.forEach((d) => items.push(d.data() as QuizItem));
    return items;
  } catch {
    return [];
  }
}

export async function loadMcpQuizzesBySetId(setId: string): Promise<QuizItem[]> {
  try {
    const colRef = collection(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID, 'quizzes');
    const q = query(colRef, where('setId', '==', setId));
    const snap = await getDocs(q);
    const items: QuizItem[] = [];
    snap.forEach((d) => items.push(d.data() as QuizItem));
    return items;
  } catch {
    return [];
  }
}

export async function deleteMcpQuizzesFromSubcollection(
  ids: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const colRef = collection(db, WORKSPACE_COLLECTION, DEFAULT_DOC_ID, 'quizzes');
    await Promise.all(ids.map((id) => deleteDoc(doc(colRef, id))));
    return { ok: true };
  } catch (err) {
    console.error('Firestore subcollection delete error:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
