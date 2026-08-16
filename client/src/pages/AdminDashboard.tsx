import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'AUCTION' | 'TEAMS' | 'USERS' | 'PLAYERS' | 'REPORTS'>('AUCTION');
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [auctionState, setAuctionState] = useState<any>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [timer, setTimer] = useState(0);
  const navigate = useNavigate();

  const [newTeam, setNewTeam] = useState({ name: '', color: '#000000', initialPurse: '' });
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', teamId: '' });
  const [newPlayer, setNewPlayer] = useState({ name: '', role: 'Batsman', basePrice: '', age: '', country: '', category: '', photoUrl: '' });
  const [message, setMessage] = useState('');
  const [newIncrement, setNewIncrement] = useState('');

  const fetchData = async () => {
    const [playersRes, statsRes, stateRes, teamsRes, usersRes] = await Promise.all([
      axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/players`),
      axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/stats`),
      axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/state`),
      axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/teams`),
      axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/users`)
    ]);
    setPlayers(playersRes.data);
    setStats(statsRes.data);
    setAuctionState(stateRes.data);
    setTeams(teamsRes.data);
    setUsers(usersRes.data);
    if (stateRes.data.settings) {
      setTimer(stateRes.data.settings.timer);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetchData();

    const newSocket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/`);
    setSocket(newSocket);

    newSocket.on('auction:update', (data) => {
      setLogs((prev) => [...prev, data.message].slice(-5));
      fetchData();
    });
    newSocket.on('auction:sold', () => fetchData());
    newSocket.on('auction:unsold', () => fetchData());
    newSocket.on('auction:newBid', () => fetchData());
    newSocket.on('auction:skip', () => fetchData());
    newSocket.on('auction:timer', (data) => setTimer(data.timer));

    return () => { newSocket.disconnect(); };
  }, [navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const startAuction = (playerId: string) => { if (socket) socket.emit('admin:startAuction', playerId); };
  const markSold = () => { if (socket) socket.emit('admin:sellPlayer'); };
  const markUnsold = () => { if (socket) socket.emit('admin:unsoldPlayer'); };
  const pauseAuction = () => { if (socket) socket.emit('admin:pause'); };
  const resumeAuction = () => { if (socket) socket.emit('admin:resume'); };
  const skipPlayer = () => { if (socket) socket.emit('admin:skip'); };
  const changeIncrement = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && newIncrement) {
      socket.emit('admin:changeIncrement', parseInt(newIncrement, 10));
      setNewIncrement('');
    }
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/teams`, newTeam);
      showMessage('Team created successfully!');
      setNewTeam({ name: '', color: '#000000', initialPurse: '' });
      fetchData();
    } catch (err: any) { showMessage(err.response?.data?.error || 'Error'); }
  };

  const handleDeleteTeam = async (id: string) => {
    if(confirm('Delete this team?')) {
      await axios.delete(`http://localhost:3001/api/auction/teams/${id}`);
      fetchData();
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/users`, newUser);
      showMessage('User created successfully!');
      setNewUser({ email: '', password: '', name: '', teamId: '' });
      fetchData();
    } catch (err: any) { showMessage(err.response?.data?.error || 'Error'); }
  };

  const handleDeleteUser = async (id: string) => {
    if(confirm('Delete this user?')) {
      await axios.delete(`http://localhost:3001/api/auction/users/${id}`);
      fetchData();
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/players`, newPlayer);
      showMessage('Player created successfully!');
      setNewPlayer({ name: '', role: 'Batsman', basePrice: '', age: '', country: '', category: '', photoUrl: '' });
      fetchData();
    } catch (err: any) { showMessage('Error creating player'); }
  };

  const handleDeletePlayer = async (id: string) => {
    if(confirm('Are you sure you want to delete this player?')) {
      await axios.delete(`http://localhost:3001/api/auction/players/${id}`);
      fetchData();
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\\n').filter(l => l.trim() !== '');
      if (lines.length < 2) return alert('Invalid CSV');
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const playersData = lines.slice(1).map(line => {
        const values = line.split(',');
        let obj: any = {};
        headers.forEach((h, i) => obj[h] = values[i]?.trim());
        return obj;
      });

      try {
        const res = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}//api/auction/players/bulk`, { players: playersData });
        showMessage(`Successfully uploaded ${res.data.count} players!`);
        fetchData();
      } catch (err) {
        alert('Failed to upload players. Check CSV format.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  const downloadCSV = (filename: string, headers: string[], data: any[]) => {
    const csvStr = [
      headers.join(','),
      ...data.map(row => headers.map(fieldName => JSON.stringify(row[fieldName] || '')).join(','))
    ].join('\\n');
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const exportAuctionSummary = () => {
    const data = players.map(p => ({
      Name: p.name,
      Role: p.role,
      BasePrice: p.basePrice,
      Status: p.status,
      SoldTo: p.team?.name || 'N/A'
    }));
    downloadCSV('Auction_Summary.csv', ['Name', 'Role', 'BasePrice', 'Status', 'SoldTo'], data);
  };

  const exportTeamSpending = () => {
    const data = teams.map(t => ({
      Team: t.name,
      InitialPurse: t.initialPurse,
      RemainingPurse: t.remainingPurse,
      TotalSpent: t.initialPurse - t.remainingPurse,
      PlayersBought: t.players?.length || 0
    }));
    downloadCSV('Team_Spending.csv', ['Team', 'InitialPurse', 'RemainingPurse', 'TotalSpent', 'PlayersBought'], data);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Admin Dashboard</h1>
            <p className="text-slate-500">Manage live auctions, teams, and users</p>
          </div>
          <button onClick={handleLogout} className="text-red-500 hover:text-red-700 font-medium">Logout</button>
        </header>

        {message && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-slate-300 pb-2 overflow-x-auto">
          {['AUCTION', 'TEAMS', 'USERS', 'PLAYERS', 'REPORTS'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-2 rounded-t-lg font-bold transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              {tab === 'AUCTION' ? 'Live Auction' : tab === 'TEAMS' ? 'Teams' : tab === 'USERS' ? 'Users' : tab === 'PLAYERS' ? 'Players' : 'Reports'}
            </button>
          ))}
        </div>

        {activeTab === 'AUCTION' && (
          <>
            <div className="grid grid-cols-4 gap-6">
              <StatCard title="Total Players" value={stats.totalPlayers} />
              <StatCard title="Total Teams" value={stats.totalTeams} />
              <StatCard title="Players Sold" value={stats.playersSold} />
              <StatCard title="Players Unsold" value={stats.playersUnsold} />
            </div>

            <div className="grid grid-cols-3 gap-8">
              {/* Active Auction Control */}
              <div className="col-span-2 space-y-8">
                <div className="bg-white p-8 rounded-2xl shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Live Auction Control</h2>
                    <div className="flex gap-2">
                      <button onClick={pauseAuction} className="px-4 py-2 bg-yellow-500 text-white rounded font-bold hover:bg-yellow-600">Pause</button>
                      <button onClick={resumeAuction} className="px-4 py-2 bg-green-500 text-white rounded font-bold hover:bg-green-600">Resume</button>
                      <button onClick={skipPlayer} className="px-4 py-2 bg-slate-500 text-white rounded font-bold hover:bg-slate-600">Skip</button>
                    </div>
                  </div>
                  
                  {auctionState.settings?.status === 'ACTIVE' && auctionState.currentPlayer ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-6 justify-between">
                        <div className="flex items-center gap-6">
                          {auctionState.currentPlayer.photo ? (
                            <img src={auctionState.currentPlayer.photo} alt={auctionState.currentPlayer.name} className="w-24 h-24 rounded-full object-cover shadow" />
                          ) : (
                            <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center text-4xl">🏏</div>
                          )}
                          <div>
                            <h3 className="text-3xl font-bold text-slate-800">{auctionState.currentPlayer.name}</h3>
                            <p className="text-lg text-slate-500">{auctionState.currentPlayer.role} • {auctionState.currentPlayer.country || 'Unknown'}</p>
                          </div>
                        </div>
                        <div className="text-center bg-slate-100 p-4 rounded-xl">
                          <p className="text-sm font-bold text-slate-500">TIMER</p>
                          <p className={`text-4xl font-bold ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-800'}`}>{timer}s</p>
                        </div>
                      </div>

                      {auctionState.settings?.isPaused && (
                        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative text-center font-bold">
                          AUCTION PAUSED
                        </div>
                      )}

                      <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex justify-between items-center">
                        <div>
                          <p className="text-sm text-blue-600 font-semibold mb-1">CURRENT HIGHEST BID</p>
                          <p className="text-5xl font-bold text-blue-900">₹{auctionState.settings.currentBid.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-blue-600 font-semibold mb-1">HIGHEST BIDDER</p>
                          <p className="text-2xl font-bold text-blue-800">
                            {auctionState.highestBiddingTeam?.name || 'None'}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button onClick={markSold} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-bold text-lg transition-colors">
                          SELL PLAYER
                        </button>
                        <button onClick={markUnsold} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-xl font-bold text-lg transition-colors">
                          MARK UNSOLD
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      No active auction. Select a player to start.
                    </div>
                  )}
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-700">Auction Settings</h3>
                    <p className="text-sm text-slate-500">Current Increment: ₹{auctionState.settings?.bidIncrement.toLocaleString()}</p>
                  </div>
                  <form onSubmit={changeIncrement} className="flex gap-2">
                    <input type="number" placeholder="New Increment" value={newIncrement} onChange={e => setNewIncrement(e.target.value)} required className="border p-2 rounded w-40" />
                    <button type="submit" className="bg-slate-800 text-white px-4 rounded font-bold">Update</button>
                  </form>
                </div>
              </div>

              {/* Activity Log */}
              <div className="bg-white p-6 rounded-2xl shadow-sm h-[600px] flex flex-col">
                <h3 className="text-xl font-bold mb-4">Activity Log</h3>
                <div className="space-y-3 flex-1 overflow-y-auto">
                  <AnimatePresence>
                    {logs.map((log, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 bg-slate-50 border-l-4 border-blue-500 rounded text-sm text-slate-700"
                      >
                        {log}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Players List */}
            <div className="bg-white p-8 rounded-2xl shadow-sm">
              <h2 className="text-2xl font-bold mb-6">Start Bidding</h2>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr className="border-b-2 border-slate-100 text-slate-500">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Role</th>
                      <th className="pb-3">Base Price</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-4 font-medium">{p.name}</td>
                        <td className="py-4 text-slate-500">{p.role}</td>
                        <td className="py-4">₹{p.basePrice.toLocaleString()}</td>
                        <td className="py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            p.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                            p.status === 'SOLD' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-4">
                          {p.status === 'AVAILABLE' && auctionState.settings?.status !== 'ACTIVE' && (
                            <button 
                              onClick={() => startAuction(p.id)}
                              className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                            >
                              Start Auction
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'TEAMS' && (
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-1 bg-white p-8 rounded-2xl shadow-sm h-fit">
              <h2 className="text-2xl font-bold mb-6">Create New Team</h2>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team Name</label>
                  <input type="text" required value={newTeam.name} onChange={e => setNewTeam({...newTeam, name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team Color</label>
                  <input type="color" value={newTeam.color} onChange={e => setNewTeam({...newTeam, color: e.target.value})} className="w-full h-10 border border-slate-300 rounded-lg p-1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Initial Purse (₹)</label>
                  <input type="number" required value={newTeam.initialPurse} onChange={e => setNewTeam({...newTeam, initialPurse: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700">Create Team</button>
              </form>
            </div>
            
            <div className="col-span-2 bg-white p-8 rounded-2xl shadow-sm">
              <h2 className="text-2xl font-bold mb-6">Existing Teams</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-slate-500">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Purse</th>
                      <th className="pb-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map(t => (
                      <tr key={t.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-4 font-bold flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }}></div>
                          {t.name}
                        </td>
                        <td className="py-4">₹{t.remainingPurse.toLocaleString()} / ₹{t.initialPurse.toLocaleString()}</td>
                        <td className="py-4">
                          <button onClick={() => handleDeleteTeam(t.id)} className="text-red-500 font-bold text-sm">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'USERS' && (
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-1 bg-white p-8 rounded-2xl shadow-sm h-fit">
              <h2 className="text-2xl font-bold mb-6">Create Team Owner</h2>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
                  <input type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email (Login ID)</label>
                  <input type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input type="password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign Team</label>
                  <select required value={newUser.teamId} onChange={e => setNewUser({...newUser, teamId: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2">
                    <option value="">Select...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Create User</button>
              </form>
            </div>

            <div className="col-span-2 bg-white p-8 rounded-2xl shadow-sm">
              <h2 className="text-2xl font-bold mb-6">Existing Users</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-slate-500">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Team Assigned</th>
                      <th className="pb-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role !== 'SUPER_ADMIN').map(u => (
                      <tr key={u.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-4 font-bold">{u.name}</td>
                        <td className="py-4">{u.email}</td>
                        <td className="py-4 font-medium text-blue-600">{u.team?.name || 'None'}</td>
                        <td className="py-4">
                          <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 font-bold text-sm">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'PLAYERS' && (
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-1 space-y-8">
              <div className="bg-white p-8 rounded-2xl shadow-sm h-fit">
                <h2 className="text-2xl font-bold mb-6">Add New Player</h2>
                <form onSubmit={handleCreatePlayer} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Player Name</label>
                    <input type="text" required value={newPlayer.name} onChange={e => setNewPlayer({...newPlayer, name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                    <select required value={newPlayer.role} onChange={e => setNewPlayer({...newPlayer, role: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2">
                      <option>Batsman</option>
                      <option>Bowler</option>
                      <option>All-Rounder</option>
                      <option>Wicket Keeper</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Base Price (₹)</label>
                    <input type="number" required value={newPlayer.basePrice} onChange={e => setNewPlayer({...newPlayer, basePrice: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                    <input type="text" value={newPlayer.country} onChange={e => setNewPlayer({...newPlayer, country: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Category (e.g. Marquee)</label>
                    <input type="text" value={newPlayer.category} onChange={e => setNewPlayer({...newPlayer, category: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2" />
                  </div>
                  <button type="submit" className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold hover:bg-slate-900">Add Player</button>
                </form>
              </div>

              <div className="bg-white p-8 rounded-2xl shadow-sm border border-emerald-200 bg-emerald-50">
                <h2 className="text-xl font-bold mb-4 text-emerald-800">Bulk Upload (CSV)</h2>
                <p className="text-sm text-emerald-600 mb-4">Upload a CSV file with headers: name, role, basePrice, country, category.</p>
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={handleBulkUpload}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200"
                />
              </div>
            </div>
            
            <div className="col-span-2 bg-white p-8 rounded-2xl shadow-sm">
              <h2 className="text-2xl font-bold mb-6">Manage Players</h2>
              <div className="overflow-x-auto max-h-[800px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr className="border-b-2 border-slate-100 text-slate-500">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Role</th>
                      <th className="pb-3">Country</th>
                      <th className="pb-3">Base Price</th>
                      <th className="pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-4 font-medium flex items-center gap-3">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 bg-slate-200 rounded-full"></div>}
                          {p.name}
                        </td>
                        <td className="py-4 text-slate-500">{p.role}</td>
                        <td className="py-4">{p.country}</td>
                        <td className="py-4">₹{p.basePrice.toLocaleString()}</td>
                        <td className="py-4">
                          <button onClick={() => handleDeletePlayer(p.id)} className="text-red-500 hover:text-red-700 text-sm font-bold">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'REPORTS' && (
          <div className="grid grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-200">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📊</div>
              <h2 className="text-2xl font-bold mb-2">Auction Summary</h2>
              <p className="text-slate-500 mb-6">Download a complete list of all players, their sold status, and which team purchased them.</p>
              <button onClick={exportAuctionSummary} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold w-full hover:bg-blue-700">
                Download CSV
              </button>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-200">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">💰</div>
              <h2 className="text-2xl font-bold mb-2">Team Spending</h2>
              <p className="text-slate-500 mb-6">Download a report of all teams, their initial purses, and total amount spent.</p>
              <button onClick={exportTeamSpending} className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold w-full hover:bg-green-700">
                Download CSV
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string, value: number }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <h3 className="text-slate-500 font-medium mb-2">{title}</h3>
      <p className="text-4xl font-bold text-slate-800">{value || 0}</p>
    </div>
  );
}
