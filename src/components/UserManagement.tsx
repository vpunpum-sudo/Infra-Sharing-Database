import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth, createUserWithEmailAndPassword, secondaryAuth, signOut, handleFirestoreError, OperationType } from '../firebase';
import { User as AppUser, UserRole, CoreOwner } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { User as FirebaseUser } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Shield, User as UserIcon, Edit2, Loader2, Check, X } from 'lucide-react';
import { logActivity } from '../services/logService';
import { ThemeToggle } from './ThemeToggle';

export const UserManagement: React.FC<{ user: FirebaseUser, appUser: AppUser | null, quotaExceeded?: boolean }> = ({ user, appUser, quotaExceeded = false }) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Viewer');
  const [owner, setOwner] = useState<CoreOwner>('ITEL');
  const [isAdding, setIsAdding] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!appUser) {
      console.log("UserManagement: No appUser, skipping fetch");
      return;
    }
    
    console.log("UserManagement: Fetching users for role:", appUser.role);
    
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      console.log("UserManagement: Received snapshot with size:", snapshot.size);
      const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
      
      let filteredList = [...usersList];
      // Filter users based on role and owner
      if (appUser.role === 'Design' || appUser.role === 'Viewer' || appUser.role === 'Sub-contract') {
        filteredList = usersList.filter(u => u.owner === appUser.owner);
      }
      
      console.log("UserManagement: Final users list size:", filteredList.length);
      setUsers(filteredList);
    }, (error) => {
      console.error("UserManagement: Error fetching users:", error);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, [appUser?.id, appUser?.role, appUser?.owner]);

  const handleAddUser = async () => {
    if (!email.trim()) return;
    
    // Check if user already exists in the local list
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert("This user is already in the list.");
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    setIsAdding(true);
    try {
      // Check if user already exists in Firestore globally (if Admin)
      if (appUser?.role === 'Admin') {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email.toLowerCase()));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          alert("This user already exists in the system database.");
          setIsAdding(false);
          return;
        }
      }

      if (password.trim()) {
        // Create full account with Auth
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          const newUser: AppUser = {
            id: userCredential.user.uid,
            email: email.toLowerCase(),
            role,
            isApproved: true,
            requiresPasswordChange: true,
            ...(role !== 'Admin' ? { owner } : { owner: 'None' })
          };
          await setDoc(doc(db, 'users', newUser.id), newUser);
          await logActivity('create_user', `Created new user account for ${email}`, { role, owner, isApproved: true });
          alert("User account created and added successfully!");
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            // Fallback to pre-authorization if account exists in Auth but not in our list
            const dummyId = 'preauth_' + uuidv4().substring(0, 8);
            const newUser: AppUser = {
              id: dummyId,
              email: email.toLowerCase(),
              role,
              isApproved: true,
              ...(role !== 'Admin' ? { owner } : { owner: 'None' })
            };
            await setDoc(doc(db, 'users', dummyId), newUser);
            await logActivity('create_preauth_user', `Created pre-authorized profile for existing auth user ${email}`, { role, owner });
            alert("This email is already registered in Authentication. A profile has been created for them so they can now access the system.");
          } else {
            throw authError;
          }
        }
      } else {
        // Pre-authorize email only
        const dummyId = 'preauth_' + uuidv4().substring(0, 8);
        const newUser: AppUser = {
          id: dummyId,
          email: email.toLowerCase(),
          role,
          isApproved: true,
          ...(role !== 'Admin' ? { owner } : { owner: 'None' })
        };
        await setDoc(doc(db, 'users', dummyId), newUser);
        await logActivity('create_preauth_user', `Pre-authorized email ${email}`, { role, owner });
        alert("Email pre-authorized successfully! They can now log in once their account is fully created.");
      }
      
      setEmail('');
      setPassword('');
      // Sign out the secondary auth so it doesn't persist
      await signOut(secondaryAuth);
    } catch (error: any) {
      console.error("Error creating user:", error);
      
      if (error.code === 'auth/weak-password') {
        alert("The password is too weak. Please use at least 6 characters.");
      } else if (error.code === 'auth/invalid-email') {
        alert("The email address is invalid.");
      } else if (error.code === 'auth/operation-not-allowed') {
        alert("Email/Password authentication is not enabled in the Firebase Console. Please enable it in the Authentication > Sign-in method tab.");
      } else {
        alert("Error creating user: " + (error.message || "Unknown error"));
      }
      
      // Log firestore error if it's a permission issue
      if (error instanceof Error && error.message.includes("Missing or insufficient permissions")) {
        handleFirestoreError(error, OperationType.CREATE, 'users');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    await deleteDoc(doc(db, 'users', userId));
    if (userToDelete) {
      await logActivity('delete_user', `Deleted user ${userToDelete.email}`, { deletedUserId: userId, role: userToDelete.role });
    }
  };

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Viewer');
  const [editOwner, setEditOwner] = useState<CoreOwner>('ITEL');
  const [searchTerm, setSearchTerm] = useState('');

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    const updatedUser: AppUser = {
      ...editingUser,
      role: editRole,
      isApproved: editingUser.isApproved ?? true,
      ...(editRole !== 'Admin' ? { owner: editOwner } : { owner: 'None' })
    };
    await setDoc(doc(db, 'users', updatedUser.id), updatedUser);
    await logActivity('update_user', `Updated user ${updatedUser.email}`, { 
      userId: updatedUser.id, 
      oldRole: editingUser.role, 
      newRole: editRole,
      oldOwner: editingUser.owner,
      newOwner: editOwner
    });
    setEditingUser(null);
  };

  const toggleApproval = async (user: AppUser) => {
    const updatedUser: AppUser = {
      ...user,
      isApproved: !user.isApproved
    };
    await setDoc(doc(db, 'users', updatedUser.id), updatedUser);
    await logActivity('toggle_user_approval', `Toggled approval for user ${user.email} to ${updatedUser.isApproved}`, { userId: user.id, isApproved: updatedUser.isApproved });
  };

  const startEdit = (user: AppUser) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditOwner(user.owner || 'ITEL');
  };

  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;
    const emailMatch = u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const roleMatch = u.role?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const ownerMatch = (u.owner && u.owner.toLowerCase().includes(searchTerm.toLowerCase())) || false;
    return emailMatch || roleMatch || ownerMatch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 relative overflow-x-hidden font-sans transition-colors duration-200">
      {/* Dynamic ambient background glow */}
      <div className="fixed top-[-10%] right-[-5%] w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-slate-400 hover:text-white font-semibold text-xs transition-all group"
        >
          <div className="w-8 h-8 bg-slate-900/80 rounded-xl flex items-center justify-center border border-slate-800 group-hover:border-brand-500/50 transition-all">
            <ArrowLeft size={14} />
          </div>
          <span>Back to Dashboard</span>
        </button>
      
        <div className="glass-panel-elevated rounded-3xl p-8 border border-slate-800/80 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                <Shield className="text-white w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight font-display">User Access Management</h2>
                <p className="text-slate-400 text-xs mt-0.5">Control tenant authentication, system roles and operator affiliations</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button 
                onClick={() => navigate('/permission-management')} 
                className="flex items-center gap-2 text-brand-300 hover:text-white font-bold text-xs bg-brand-500/10 hover:bg-brand-500/20 px-4 py-2.5 rounded-xl transition-all border border-brand-500/30"
              >
                <Shield size={15} /> Role Permissions Matrix
              </button>
            </div>
          </div>
          
          {/* Add User Form */}
          <div className="p-6 bg-slate-900/60 rounded-2xl border border-slate-800 mb-8 relative overflow-hidden">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Plus size={14} className="text-brand-400" /> Provision New User
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="name@company.com" 
                  className="w-full bg-slate-950/80 border border-slate-700/80 p-2.5 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors" 
                />
              </div>
              <div>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="Password (Optional)" 
                  className="w-full bg-slate-950/80 border border-slate-700/80 p-2.5 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors" 
                />
              </div>
              <div>
                <select 
                  value={role} 
                  onChange={e => setRole(e.target.value as UserRole)} 
                  className="w-full bg-slate-950/80 border border-slate-700/80 p-2.5 rounded-xl text-white text-xs focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
                >
                  <option value="Admin">Admin</option>
                  <option value="Management">Management (ทีม O&M / ผู้บริหาร)</option>
                  <option value="Planning">Planning (ทีมวางแผนโครงข่าย)</option>
                  <option value="Design">Design (ผู้ออกแบบ)</option>
                  <option value="Viewer">Viewer</option>
                  <option value="Sub-contract">Sub-contract</option>
                </select>
              </div>
              <div>
                {(role !== 'Admin') ? (
                  <select 
                    value={owner} 
                    onChange={e => setOwner(e.target.value as CoreOwner)} 
                    className="w-full bg-slate-950/80 border border-slate-700/80 p-2.5 rounded-xl text-white text-xs focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
                  >
                    <option value="ITEL">ITEL</option>
                    <option value="SYMC">SYMC</option>
                    <option value="UIH">UIH</option>
                  </select>
                ) : (
                  <div className="w-full bg-slate-950/40 p-2.5 rounded-xl text-slate-500 text-center font-bold text-xs border border-slate-800 flex items-center justify-center h-full">
                    System Wide
                  </div>
                )}
              </div>
              <button 
                onClick={handleAddUser} 
                disabled={isAdding || quotaExceeded}
                className="btn-primary py-2.5 px-4 text-xs font-bold w-full"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={16} />}
                <span>{isAdding ? 'Adding...' : 'Add User'}</span>
              </button>
            </div>
          </div>

          {/* User List Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white font-display">Authorized Accounts</h3>
                <span className="bg-brand-500/15 text-brand-400 px-2.5 py-0.5 rounded-full text-xs font-bold border border-brand-500/30">{users.length} Users</span>
              </div>
              <div className="relative w-full sm:w-72">
                <input 
                  type="text" 
                  placeholder="Filter users by email/role..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 pl-9 pr-3 py-2 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
                />
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              </div>
            </div>

            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
              <div className="bg-slate-900/80 px-6 py-3.5 grid grid-cols-12 gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <div className="col-span-4">User Information</div>
                <div className="col-span-2">Approval</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Operator</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-slate-800/80">
                {filteredUsers.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-slate-800/60 rounded-xl flex items-center justify-center mx-auto mb-3 border border-slate-700">
                      <UserIcon className="text-slate-400 w-6 h-6" />
                    </div>
                    <p className="text-slate-400 text-xs font-medium">No users found matching your query.</p>
                  </div>
                ) : (
                  filteredUsers.map(u => (
                    <div key={u.id} className="px-6 py-4 grid grid-cols-12 gap-4 items-center hover:bg-slate-800/40 transition-colors">
                      {editingUser?.id === u.id ? (
                        <div className="col-span-12 grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-4 font-bold text-white text-xs truncate">{u.email}</div>
                          <div className="col-span-2">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${u.isApproved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                              {u.isApproved ? 'Approved' : 'Pending'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <select 
                              value={editRole} 
                              onChange={e => setEditRole(e.target.value as UserRole)} 
                              className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-xs font-bold text-white outline-none focus:border-brand-500"
                            >
                              <option value="Admin">Admin</option>
                              <option value="Management">Management (ทีม O&M / ผู้บริหาร)</option>
                              <option value="Planning">Planning (ทีมวางแผนโครงข่าย)</option>
                              <option value="Design">Design (ผู้ออกแบบ)</option>
                              <option value="Viewer">Viewer</option>
                              <option value="Sub-contract">Sub-contract</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            {(editRole !== 'Admin') ? (
                              <select 
                                value={editOwner} 
                                onChange={e => setEditOwner(e.target.value as CoreOwner)} 
                                className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-xs font-bold text-white outline-none focus:border-brand-500"
                              >
                                <option value="ITEL">ITEL</option>
                                <option value="SYMC">SYMC</option>
                                <option value="UIH">UIH</option>
                              </select>
                            ) : <span className="text-xs text-slate-500">System Wide</span>}
                          </div>
                          <div className="col-span-2 flex justify-end gap-2">
                            <button 
                              onClick={handleUpdateUser} 
                              disabled={quotaExceeded}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors"
                            >
                              Save
                            </button>
                            <button onClick={() => setEditingUser(null)} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="col-span-4 flex items-center gap-3">
                            <div className="w-9 h-9 bg-slate-800 text-brand-400 rounded-xl flex items-center justify-center font-bold text-xs border border-slate-700">
                              {u.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <p className="font-bold text-white text-xs truncate">{u.email}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {u.id.substring(0, 8)}</p>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <button 
                              onClick={() => toggleApproval(u)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold border transition-all ${
                                u.isApproved 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 animate-pulse'
                              }`}
                            >
                              {u.isApproved ? <Check size={11} /> : <X size={11} />}
                              {u.isApproved ? 'Approved' : 'Pending'}
                            </button>
                          </div>
                          <div className="col-span-2">
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                              u.role === 'Admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                              u.role === 'Management' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                              u.role === 'Design' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                              u.role === 'Sub-contract' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                              'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {u.role}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs font-bold text-slate-300">
                              {u.owner || 'None'}
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-end gap-1">
                            <button 
                              onClick={() => startEdit(u)} 
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                              title="Edit User"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(u.id)} 
                              disabled={quotaExceeded}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete User"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
