import { useEffect, useState } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'

export function useReports(projectId) {
  const { user, profile } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) { setReports([]); setLoading(false); return }
    const q = query(
      collection(db, 'projects', projectId, 'reports'),
      orderBy('number', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error('Firestore reports:', err.message)
      setLoading(false)
    })
    return unsub
  }, [projectId])

  async function createReport(projectId, reportNumber, data) {
    const ref = await addDoc(collection(db, 'projects', projectId, 'reports'), {
      ...data,
      number: reportNumber,
      authorId: user.uid,
      authorName: profile?.displayName || user.displayName || user.email,
      firmName: profile?.firm || '',
      entries: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'projects', projectId), {
      reportCount: increment(1),
      updatedAt: serverTimestamp(),
    })
    return ref
  }

  async function updateReport(projectId, reportId, data) {
    await updateDoc(doc(db, 'projects', projectId, 'reports', reportId), {
      ...data,
      updatedAt: serverTimestamp(),
    })
  }

  async function deleteReport(projectId, reportId) {
    await deleteDoc(doc(db, 'projects', projectId, 'reports', reportId))
    await updateDoc(doc(db, 'projects', projectId), {
      reportCount: increment(-1),
      updatedAt: serverTimestamp(),
    })
  }

  return { reports, loading, createReport, updateReport, deleteReport }
}
