import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus, Loader2, Pencil, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { db, functions } from '../firebase';
import { Project, ProjectFile, ProjectFolder } from '../types';

const manageProjectFile = httpsCallable(functions, 'manageProjectFile');

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// Sends the file straight to the Storage resumable session from startUpload.
function uploadToStorage(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve() : reject(new Error(`อัปโหลดไฟล์ไม่สำเร็จ (${request.status})`));
    request.onerror = () => reject(new Error('อัปโหลดไฟล์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่'));
    request.send(file);
  });
}

export function ProjectFilesModal({ project, canManage, onClose }: {
  project: Project; canManage: boolean; onClose: () => void;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, `projects/${project.id}/files`), snapshot => {
      setFiles(snapshot.docs.map(item => item.data() as ProjectFile)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setError('');
    }, () => setError('ไม่สามารถโหลดไฟล์โครงการได้ กรุณาตรวจสอบสิทธิ์และลองใหม่'));
    return unsubscribe;
  }, [project.id]);

  useEffect(() => onSnapshot(collection(db, `projects/${project.id}/folders`), snapshot => {
    setFolders(snapshot.docs.map(item => item.data() as ProjectFolder)
      .sort((a, b) => a.name.localeCompare(b.name, 'th')));
  }, () => setError('ไม่สามารถโหลดโฟลเดอร์ได้ กรุณาตรวจสอบสิทธิ์และลองใหม่')), [project.id]);

  // Return to the top level if the open folder is deleted elsewhere.
  useEffect(() => {
    if (folderId && !folders.some(folder => folder.id === folderId)) setFolderId(null);
  }, [folders, folderId]);

  const breadcrumb: ProjectFolder[] = [];
  for (let id = folderId; id;) {
    const folder = folders.find(item => item.id === id);
    if (!folder || breadcrumb.includes(folder)) break;
    breadcrumb.unshift(folder);
    id = folder.parentId;
  }
  const childFolders = folders.filter(folder => (folder.parentId || null) === folderId);
  const folderFiles = files.filter(item => (item.folderId || null) === folderId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function run(action: string, values: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      return (await manageProjectFile({ action, projectId: project.id, ...values })).data as Record<string, string>;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ดำเนินการกับไฟล์ไม่สำเร็จ');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onChooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (chosen.size === 0) {
      setError('ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์อื่น');
      return;
    }
    const fileId = replaceId;
    setReplaceId(null);
    const target = fileId ? { fileId } : { name: chosen.name, folderId };
    const session = await run('startUpload', { ...target, contentType: chosen.type || 'application/octet-stream' });
    if (!session) return;
    setBusy(true);
    setProgress(0);
    try {
      await uploadToStorage(session.uploadUrl, chosen, setProgress);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อัปโหลดไฟล์ไม่สำเร็จ');
      setBusy(false);
      return;
    } finally {
      setProgress(null);
    }
    await run('finishUpload', { ...target, id: session.id, storagePath: session.storagePath });
  }

  async function download(item: ProjectFile) {
    const result = await run('downloadUrl', { fileId: item.id });
    if (!result) return;
    // Storage serves the file as an attachment under its project name.
    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.name || item.name;
    link.click();
  }

  async function rename(item: ProjectFile) {
    const name = editingName.trim();
    if (!name || name === item.name) { setEditingId(null); return; }
    if (await run('rename', { fileId: item.id, name })) setEditingId(null);
  }

  async function createFolder() {
    const name = (newFolderName || '').trim();
    if (!name) { setNewFolderName(null); return; }
    if (await run('createFolder', { name, parentId: folderId })) setNewFolderName(null);
  }

  async function renameFolder(folder: ProjectFolder) {
    const name = editingName.trim();
    if (!name || name === folder.name) { setEditingFolderId(null); return; }
    if (await run('renameFolder', { folderId: folder.id, name })) setEditingFolderId(null);
  }

  async function removeFolder(folder: ProjectFolder) {
    if (!window.confirm(`ลบโฟลเดอร์ “${folder.name}”? (ลบได้เฉพาะโฟลเดอร์ว่าง)`)) return;
    await run('deleteFolder', { folderId: folder.id });
  }

  async function remove(item: ProjectFile) {
    if (!window.confirm(`ลบไฟล์ “${item.name}” ออกจากโครงการ?`)) return;
    await run('delete', { fileId: item.id });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={`ไฟล์โครงการ ${project.name}`}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-700 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><FolderOpen size={20} /> ไฟล์โครงการ</h2>
            <p className="mt-1 text-sm text-slate-300">{project.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-2 hover:bg-slate-800"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">{childFolders.length > 0 && `${childFolders.length} โฟลเดอร์ · `}{folderFiles.length} ไฟล์</p>
            {canManage && <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setNewFolderName('')}
                className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold hover:bg-slate-800 disabled:opacity-60">
                <FolderPlus size={16} /> สร้างโฟลเดอร์
              </button>
              <button type="button" disabled={busy} onClick={() => { setReplaceId(null); fileInput.current?.click(); }}
                className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {progress === null ? 'เพิ่มไฟล์' : `กำลังอัปโหลด ${progress}%`}
              </button>
            </div>}
            <input ref={fileInput} type="file" className="hidden" onChange={onChooseFile} />
          </div>
          <nav aria-label="ตำแหน่งโฟลเดอร์" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => setFolderId(null)}
              className={`rounded px-1.5 py-0.5 hover:bg-slate-800 ${folderId ? 'text-sky-300' : 'font-bold'}`}>ไฟล์ทั้งหมด</button>
            {breadcrumb.map(folder => <React.Fragment key={folder.id}>
              <ChevronRight size={14} className="text-slate-400" />
              <button type="button" onClick={() => setFolderId(folder.id)}
                className={`rounded px-1.5 py-0.5 hover:bg-slate-800 ${folder.id === folderId ? 'font-bold' : 'text-sky-300'}`}>{folder.name}</button>
            </React.Fragment>)}
          </nav>
          {newFolderName !== null && <div className="mb-3 flex items-center gap-2 rounded-xl border border-sky-500 bg-slate-800/60 p-3">
            <FolderPlus size={20} className="shrink-0 text-amber-300" />
            <input autoFocus value={newFolderName} placeholder="ชื่อโฟลเดอร์ใหม่" maxLength={100}
              onChange={event => setNewFolderName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') createFolder(); if (event.key === 'Escape') { event.stopPropagation(); setNewFolderName(null); } }}
              className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm" />
            <button type="button" onClick={createFolder} disabled={busy} className="text-sm font-bold text-sky-300">สร้าง</button>
            <button type="button" onClick={() => setNewFolderName(null)} className="text-sm text-slate-300">ยกเลิก</button>
          </div>}
          {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/50 p-3 text-sm text-rose-100">{error}</p>}
          {childFolders.length > 0 && <ul className="mb-2 space-y-2">{childFolders.map(folder => <li key={folder.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {editingFolderId === folder.id ? <div className="flex min-w-0 flex-1 items-center gap-3">
                <Folder size={20} className="shrink-0 text-amber-300" />
                <input autoFocus value={editingName} maxLength={100} onChange={event => setEditingName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') renameFolder(folder); }}
                  className="min-w-0 flex-1 rounded border border-sky-500 bg-slate-950 px-2 py-1 text-sm" />
                <button type="button" onClick={() => renameFolder(folder)} disabled={busy} className="text-sm font-bold text-sky-300">บันทึก</button>
              </div> : <button type="button" onClick={() => setFolderId(folder.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Folder size={20} className="shrink-0 text-amber-300" />
                <span className="break-all text-sm font-semibold">{folder.name}</span>
              </button>}
              {canManage && <div className="flex items-center gap-1">
                <button type="button" disabled={busy} onClick={() => { setEditingFolderId(folder.id); setEditingName(folder.name); }} title="แก้ชื่อ" aria-label={`แก้ชื่อโฟลเดอร์ ${folder.name}`} className="rounded-lg p-2 hover:bg-slate-700"><Pencil size={17} /></button>
                <button type="button" disabled={busy} onClick={() => removeFolder(folder)} title="ลบ" aria-label={`ลบโฟลเดอร์ ${folder.name}`} className="rounded-lg p-2 text-rose-300 hover:bg-rose-950"><Trash2 size={17} /></button>
              </div>}
            </div>
          </li>)}</ul>}
          {folderFiles.length === 0 ? (childFolders.length === 0 && <p className="rounded-xl border border-dashed border-slate-600 p-8 text-center text-sm text-slate-300">{folderId ? 'โฟลเดอร์นี้ยังว่างอยู่' : 'ยังไม่มีไฟล์ในโครงการนี้'}</p>) :
            <ul className="space-y-2">{folderFiles.map(item => <li key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText size={20} className="mt-1 shrink-0 text-sky-300" />
                  <div className="min-w-0">
                    {editingId === item.id ? <div className="flex gap-2">
                      <input autoFocus value={editingName} onChange={event => setEditingName(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') rename(item); }}
                        className="min-w-0 flex-1 rounded border border-sky-500 bg-slate-950 px-2 py-1 text-sm" />
                      <button type="button" onClick={() => rename(item)} disabled={busy} className="text-sm font-bold text-sky-300">บันทึก</button>
                    </div> : <p className="break-all text-sm font-semibold">{item.name}</p>}
                    <p className="mt-1 text-xs text-slate-300">{formatSize(item.size)} · แก้ไข {formatDate(item.updatedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={busy} onClick={() => download(item)} title="ดาวน์โหลด" aria-label={`ดาวน์โหลด ${item.name}`} className="rounded-lg p-2 hover:bg-slate-700"><Download size={17} /></button>
                  {canManage && <>
                    <button type="button" disabled={busy} onClick={() => { setEditingId(item.id); setEditingName(item.name); }} title="แก้ชื่อ" aria-label={`แก้ชื่อ ${item.name}`} className="rounded-lg p-2 hover:bg-slate-700"><Pencil size={17} /></button>
                    <button type="button" disabled={busy} onClick={() => { setReplaceId(item.id); fileInput.current?.click(); }} title="แทนไฟล์" aria-label={`แทนไฟล์ ${item.name}`} className="rounded-lg p-2 hover:bg-slate-700"><RefreshCw size={17} /></button>
                    <button type="button" disabled={busy} onClick={() => remove(item)} title="ลบ" aria-label={`ลบ ${item.name}`} className="rounded-lg p-2 text-rose-300 hover:bg-rose-950"><Trash2 size={17} /></button>
                  </>}
                </div>
              </div>
            </li>)}</ul>}
        </div>
      </section>
    </div>
  );
}
