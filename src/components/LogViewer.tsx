import React, { useEffect, useReducer, useRef, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, startAfter, limit, getDocs, doc, getDoc, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { UserLog } from '../types';
import { ChevronDown, ChevronUp, Monitor, Info, ChevronLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  canLoadMore, canRefresh, fetchLogPage, initialLogListState, isEndOfList,
  logListReducer, shouldQueryLogs, type LogListAction, type LogListState,
  type LogPageQuerySpec, type RequestKind,
} from '../utils/logPagination';

type LogCursor = QueryDocumentSnapshot;
type ViewerState = LogListState<UserLog, LogCursor>;
type ViewerAction = LogListAction<UserLog, LogCursor>;

export const LogViewer = () => {
  const [listState, dispatch] = useReducer(logListReducer<UserLog, LogCursor>, initialLogListState<UserLog, LogCursor>());
  const listStateRef = useRef<ViewerState>(listState);
  const requestIdRef = useRef(0);
  const firstLoadStartedRef = useRef(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdmin = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().role === 'Admin') {
          setIsAdmin(true);
        }
      }
      setLoading(false);
    };
    checkAdmin();
  }, []);

  const dispatchList = (action: ViewerAction) => {
    listStateRef.current = logListReducer(listStateRef.current, action);
    dispatch(action);
  };

  const fetcher = async (spec: LogPageQuerySpec<LogCursor>) => {
    const constraints: QueryConstraint[] = [orderBy(spec.orderByField, spec.direction)];
    if (spec.startAfter) constraints.push(startAfter(spec.startAfter));
    constraints.push(limit(spec.limit));
    const snapshot = await getDocs(query(collection(db, 'logs'), ...constraints));
    return snapshot.docs.map(d => ({ id: d.id, data: d.data() as UserLog, cursor: d }));
  };

  const run = async (kind: RequestKind) => {
    const current = listStateRef.current;
    if (kind === 'refresh' ? !canRefresh(current) : !canLoadMore(current)) return;
    const requestId = ++requestIdRef.current;
    dispatchList({ type: 'start', kind, requestId });
    try {
      const page = await fetchLogPage(fetcher, kind === 'more' ? current.cursor : null);
      dispatchList({ type: 'success', requestId, page });
    } catch (error) {
      console.error('Failed to load system activity logs:', error);
      dispatchList({ type: 'failure', requestId, error: 'Could not load logs. Please try again.' });
    }
  };

  useEffect(() => {
    if (!shouldQueryLogs(isAdmin, !loading) || firstLoadStartedRef.current) return;
    firstLoadStartedRef.current = true;
    void run('refresh');
  }, [isAdmin, loading]);

  useEffect(() => {
    if (expandedLogId !== null && !listState.rows.some(row => row.id === expandedLogId)) {
      setExpandedLogId(null);
    }
  }, [listState.rows, expandedLogId]);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  if (loading) return <div className="p-8 text-white">Loading logs...</div>;
  if (!isAdmin) return <div className="p-8 text-white">Access Denied. Only administrators can view system logs.</div>;

  const logs = listState.rows;

  return (
    <div className="p-8 bg-slate-950 text-white min-h-screen">
      <button 
        onClick={() => navigate('/')} 
        className="mb-8 flex items-center gap-3 text-slate-500 hover:text-slate-100 font-black transition-all hover:-translate-x-1 group"
      >
        <ChevronLeft size={22} className="group-hover:text-brand-400 transition-colors" /> 
        <span className="uppercase tracking-widest text-xs">Back to Dashboard</span>
      </button>
      <h2 className="text-5xl font-black mb-8 tracking-tighter font-display">System Activity Logs</h2>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-400">Showing {logs.length} logs</span>
        <button
          type="button"
          onClick={() => void run('refresh')}
          disabled={!canRefresh(listState)}
          className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={listState.pending?.kind === 'refresh' ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      {listState.error && (
        <div role="alert" className="mb-4 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
          <span>{listState.error.message}</span>
          <button type="button" onClick={() => void run(listState.error!.kind)} className="font-bold underline">Retry</button>
        </div>
      )}
      <div className="glass-panel rounded-[2rem] overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800">
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest w-10"></th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Timestamp</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">User</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Action</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.map(({ id, data: log }) => (
                <React.Fragment key={id}>
                  <tr 
                    className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${expandedLogId === id ? 'bg-slate-800/30' : ''}`}
                    onClick={() => toggleExpand(id)}
                  >
                    <td className="p-4 text-slate-500">
                      {expandedLogId === id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                    <td className="p-4 text-sm text-slate-300 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                    <td data-wi-pii="log-user" className="p-4 text-sm font-bold text-brand-400">{log.userEmail}</td>
                    <td className="p-4 text-sm">
                      <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                        {log.action}
                      </span>
                    </td>
                    <td data-wi-pii="log-description" className="p-4 text-sm text-slate-300">{log.description}</td>
                  </tr>
                  {expandedLogId === id && (
                    <tr className="bg-slate-900/40">
                      <td colSpan={5} className="p-6 border-t border-slate-800/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              <Monitor size={14} /> Environment Details
                            </h4>
                            <div className="bg-slate-950/50 rounded-xl p-4 space-y-3 border border-slate-800/50">
                              <div>
                                <span className="text-xs text-slate-500 uppercase tracking-widest block mb-1">Path</span>
                                <span className="text-sm text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded">{log.path || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 uppercase tracking-widest block mb-1">User Agent</span>
                                <span className="text-xs text-slate-400 break-all">{log.userAgent || 'N/A'}</span>
                              </div>
                              <div className="flex gap-6">
                                <div>
                                  <span className="text-xs text-slate-500 uppercase tracking-widest block mb-1">Resolution</span>
                                  <span className="text-sm text-slate-300">{log.screenResolution || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-slate-500 uppercase tracking-widest block mb-1">Language</span>
                                  <span className="text-sm text-slate-300">{log.language || 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              <Info size={14} /> Additional Metadata
                            </h4>
                            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 h-full">
                              {log.metadata && Object.keys(log.metadata).length > 0 ? (
                                <pre className="text-xs text-brand-300 font-mono overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              ) : (
                                <span className="text-sm text-slate-500 italic">No additional metadata provided.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {logs.length === 0 && !listState.pending && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">No activity logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 flex justify-center">
        {listState.hasMore && (
          <button
            type="button"
            onClick={() => void run('more')}
            disabled={!canLoadMore(listState)}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {listState.pending?.kind === 'more' ? 'Loading…' : 'Load more'}
          </button>
        )}
        {isEndOfList(listState) && <span className="text-sm text-slate-500">No more logs</span>}
      </div>
    </div>
  );
};
