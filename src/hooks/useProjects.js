import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'

export function useProjects() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setProjects([]); setLoading(false); return }
    const q = query(
      collection(db, 'projects'),
      where('members', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function createProject(data) {
    return addDoc(collection(db, 'projects'), {
      ...data,
      members: [user.uid],
      createdBy: user.uid,
      reportCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function updateProject(id, data) {
    await updateDoc(doc(db, 'projects', id), { ...data, updatedAt: serverTimestamp() })
  }

  async function deleteProject(id) {
    await deleteDoc(doc(db, 'projects', id))
  }

  return { projects, loading, createProject, updateProject, deleteProject }
}
