import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

export default function TeamDashboard() {
  const [auctionState, setAuctionState] = useState<any>({});
  const [team, setTeam] = useState<any>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [timer, setTimer] = useState(0);
  const [purchasedPlayers, setPurchasedPlayers] = useState<any[]>([]);
  
  // Banner state: null | { type: 'SOLD' | 'UNSOLD', message: string }
  const [banner, setBanner] = useState<any>(null);
  
  const navigate = useNavigate();

  const fetchTeamData = async (teamId: string) => {
    const teamsRes = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auction/teams`);
    const myTeam = teamsRes.data.find((t: any) => t.id === teamId);
    if (myTeam) {
      setTeam(myTeam);
      setPurchasedPlayers(myTeam.players || []);
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(userStr);
    
    fetchTeamData(user.team.id);

    const fetchData = async () => {
      const stateRes = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auction/state`);
      setAuctionState(stateRes.data);
      if (stateRes.data.settings) setTimer(stateRes.data.settings.timer);
    };
    fetchData();

    const newSocket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/`);
    setSocket(newSocket);

    newSocket.on('auction:update', (data) => {
      setLogs((prev) => [...prev, data.message].slice(-5));
      fetchData();
    });
    newSocket.on('auction:newBid', () => {
      // Play sound here
      const audio = new Audio('/bid-sound.mp3');
      audio.play().catch(() => {});
      fetchData();
    });
    newSocket.on('auction:timer', (data) => {
      setTimer(data.timer);
    });
    newSocket.on('auction:sold', (data) => {
      setBanner({ type: 'SOLD', message: `${data.player.name} sold to ${data.team.name} for ₹${data.amount.toLocaleString()}!` });
      setTimeout(() => setBanner(null), 5000);
      fetchData();
      fetchTeamData(user.team.id);
    });
    newSocket.on('auction:unsold', (data) => {
      setBanner({ type: 'UNSOLD', message: `${data.player.name} went unsold.` });
      setTimeout(() => setBanner(null), 5000);
      fetchData();
    });
    newSocket.on('auction:skip', () => {
      fetchData();
    });

    return () => { newSocket.disconnect(); };
  }, [navigate]);

  const placeBid = () => {
    if (socket && team.id) {
      socket.emit('team:placeBid', { teamId: team.id });
    }
  };

  const isHighestBidder = auctionState.highestBiddingTeam?.id === team?.id;
  const nextBidAmount = auctionState.settings?.highestBidderId === null 
    ? auctionState.settings?.currentBid 
    : auctionState.settings?.currentBid + auctionState.settings?.bidIncrement;
  
  const canBid = team?.remainingPurse >= nextBidAmount && !isHighestBidder && !auctionState.settings?.isPaused;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      
      {/* Banner Overlay */}
      <AnimatePresence>
        {banner && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -50 }}
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none`}
          >
            <div className={`p-12 rounded-3xl text-center border-4 ${banner.type === 'SOLD' ? 'border-green-500 bg-green-900/50 text-green-400' : 'border-red-500 bg-red-900/50 text-red-400'}`}>
              <h1 className="text-8xl font-black mb-4">{banner.type}</h1>
              <p className="text-3xl font-bold text-white">{banner.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2" style={{ borderColor: team?.color || '#fff' }}></div>
            <div>
              <h1 className="text-2xl font-bold text-white">{team?.name}</h1>
              <p className="text-slate-400">Team Dashboard</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400 mb-1">REMAINING PURSE</p>
            <p className="text-4xl font-black text-green-400">₹{team?.remainingPurse?.toLocaleString()}</p>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-8">
          
          {/* Main Auction Area */}
          <div className="col-span-3 space-y-8">
            {auctionState.settings?.status === 'ACTIVE' && auctionState.currentPlayer ? (
              <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 relative overflow-hidden">
                {isHighestBidder && (
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 to-emerald-400"></div>
                )}
                
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-6">
                    {auctionState.currentPlayer.photo ? (
                      <img src={auctionState.currentPlayer.photo} alt={auctionState.currentPlayer.name} className="w-32 h-32 rounded-2xl object-cover shadow-lg border-2 border-slate-600" />
                    ) : (
                      <div className="w-32 h-32 bg-slate-700 rounded-2xl border-2 border-slate-600 flex items-center justify-center text-5xl">🏏</div>
                    )}
                    <div>
                      <h2 className="text-5xl font-black text-white mb-2 tracking-tight">
                        {auctionState.currentPlayer.name}
                      </h2>
                      <p className="text-2xl text-slate-400 font-medium">
                        {auctionState.currentPlayer.role} • {auctionState.currentPlayer.country || 'Unknown'} 
                        {auctionState.currentPlayer.category && ` • ${auctionState.currentPlayer.category}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-center bg-slate-900 p-4 rounded-2xl border border-slate-700">
                    <p className="text-sm text-slate-400 font-bold mb-1">TIMER</p>
                    <p className={`text-6xl font-black tabular-nums ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                      {timer}s
                    </p>
                  </div>
                </div>

                {auctionState.settings?.isPaused && (
                  <div className="bg-yellow-900/50 border border-yellow-500 text-yellow-300 p-4 rounded-xl text-center font-bold text-xl mb-6">
                    AUCTION PAUSED BY ADMIN
                  </div>
                )}

                <div className="bg-slate-900/80 p-8 rounded-2xl border border-slate-700 mb-8 backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-slate-400 uppercase tracking-wider font-semibold">Current Highest Bid</p>
                    <p className="text-sm text-slate-400 uppercase tracking-wider font-semibold">Base Price: ₹{auctionState.currentPlayer.basePrice.toLocaleString()}</p>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-7xl font-black text-white">
                      ₹{auctionState.settings.currentBid.toLocaleString()}
                    </p>
                    {auctionState.highestBiddingTeam ? (
                      <div className="text-right">
                        <p className="text-sm text-slate-400 mb-1">Held By</p>
                        <p className="text-3xl font-black uppercase" style={{ color: auctionState.highestBiddingTeam.color }}>
                          {auctionState.highestBiddingTeam.name}
                        </p>
                      </div>
                    ) : (
                      <div className="text-right text-slate-500 font-bold text-xl">No bids yet</div>
                    )}
                  </div>
                </div>

                <button
                  onClick={placeBid}
                  disabled={!canBid}
                  className={`w-full py-8 rounded-2xl text-4xl font-black transition-all transform active:scale-95 ${
                    isHighestBidder 
                      ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50 cursor-not-allowed'
                      : canBid 
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_50px_-10px_rgba(79,70,229,0.5)] border border-blue-400'
                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  {isHighestBidder ? 'YOU HOLD THE HIGHEST BID' : auctionState.settings?.isPaused ? 'AUCTION PAUSED' : `BID ₹${nextBidAmount.toLocaleString()}`}
                </button>
              </div>
            ) : (
              <div className="bg-slate-800 p-24 rounded-3xl text-center border border-slate-700 shadow-xl flex flex-col items-center justify-center h-full">
                <div className="w-24 h-24 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin mb-8"></div>
                <h2 className="text-4xl font-bold text-slate-400 mb-4">Waiting for Player</h2>
                <p className="text-xl text-slate-500">The auctioneer has not started bidding on any player yet.</p>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="col-span-1 space-y-8">
            
            {/* Activity Log */}
            <div className="bg-slate-800 p-6 rounded-3xl shadow-xl border border-slate-700 max-h-80 overflow-hidden">
              <h3 className="text-xl font-bold text-white mb-4">Live Auction Log</h3>
              <div className="space-y-3">
                <AnimatePresence>
                  {logs.map((log, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 bg-slate-900/50 rounded-lg text-slate-300 text-sm border-l-4 border-blue-500"
                    >
                      {log}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Purchased Players */}
            <div className="bg-slate-800 p-6 rounded-3xl shadow-xl border border-slate-700 flex-1">
              <h3 className="text-xl font-bold text-white mb-4 flex justify-between">
                <span>Squad</span>
                <span className="text-blue-400">{purchasedPlayers.length}</span>
              </h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {purchasedPlayers.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">No players purchased yet.</p>
                ) : (
                  purchasedPlayers.map((p: any) => (
                    <div key={p.id} className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.role}</p>
                      </div>
                      <span className="text-green-400 font-bold text-sm bg-green-900/30 px-2 py-1 rounded">Bought</span>
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
}
