import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { UserLog } from '../types';
import { ChevronDown, ChevronUp, Monitor, Globe, MapPin, Info, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const LogViewer = () => {
  const [logs, setLogs] = useState<UserLog[]>([]);
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

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => doc.data() as UserLog);
      setLogs(logsData);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  if (loading) return <div className="p-8 text-white">Loading logs...</div>;
  if (!isAdmin) return <div className="p-8 text-white">Access Denied. Only administrators can view system logs.</div>;

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
              {logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr 
                    className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${expandedLogId === log.id ? 'bg-slate-800/30' : ''}`}
                    onClick={() => toggleExpand(log.id)}
                  >
                    <td className="p-4 text-slate-500">
                      {expandedLogId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                    <td className="p-4 text-sm text-slate-300 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-4 text-sm font-bold text-brand-400">{log.userEmail}</td>
                    <td className="p-4 text-sm">
                      <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-300">{log.description}</td>
                  </tr>
                  {expandedLogId === log.id && (
                    <tr className="bg-slate-900/40">
                      <td colSpan={5} className="p-6 border-t border-slate-800/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              <Monitor size={14} /> Environment Details
                            </h4>
                            <div className="bg-slate-950/50 rounded-xl p-4 space-y-3 border border-slate-800/50">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Path</span>
                                <span className="text-sm text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded">{log.path || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">User Agent</span>
                                <span className="text-xs text-slate-400 break-all">{log.userAgent || 'N/A'}</span>
                              </div>
                              <div className="flex gap-6">
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Resolution</span>
                                  <span className="text-sm text-slate-300">{log.screenResolution || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Language</span>
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
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">No activity logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
