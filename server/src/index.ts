import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import authRouter from './routes/auth';
import auctionRouter from './routes/auction';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/auction', auctionRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Timer Loop
let timerInterval: NodeJS.Timeout | null = null;

const startTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (!settings || settings.status !== 'ACTIVE' || settings.isPaused) return;

      if (settings.timer > 0) {
        const newTimer = settings.timer - 1;
        await prisma.auctionSettings.update({
          where: { id: settings.id },
          data: { timer: newTimer }
        });
        io.emit('auction:timer', { timer: newTimer });
      }
    } catch (e) {
      console.error('Timer error:', e);
    }
  }, 1000);
};

startTimer();

// Socket.io Real-time Logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Admin actions
  socket.on('admin:startAuction', async (playerId) => {
    try {
      const player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player) return;

      const settings = await prisma.auctionSettings.findFirst();
      await prisma.auctionSettings.update({
        where: { id: settings!.id },
        data: {
          status: 'ACTIVE',
          isPaused: false,
          currentPlayerId: player.id,
          currentBid: player.basePrice,
          highestBidderId: null,
          timer: 30
        }
      });
      io.emit('auction:update', { message: `Auction started for ${player.name}` });
    } catch (e) { console.error(e); }
  });

  socket.on('admin:pause', async () => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (settings) {
        await prisma.auctionSettings.update({ where: { id: settings.id }, data: { isPaused: true } });
        io.emit('auction:update', { message: `Auction Paused` });
      }
    } catch (e) { console.error(e); }
  });

  socket.on('admin:resume', async () => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (settings) {
        await prisma.auctionSettings.update({ where: { id: settings.id }, data: { isPaused: false } });
        io.emit('auction:update', { message: `Auction Resumed` });
      }
    } catch (e) { console.error(e); }
  });

  socket.on('admin:changeIncrement', async (amount: number) => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (settings) {
        await prisma.auctionSettings.update({ where: { id: settings.id }, data: { bidIncrement: amount } });
        io.emit('auction:update', { message: `Bid increment changed to ₹${amount}` });
      }
    } catch (e) { console.error(e); }
  });

  socket.on('admin:skip', async () => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (settings) {
        await prisma.auctionSettings.update({
          where: { id: settings.id },
          data: { status: 'PENDING', currentPlayerId: null, highestBidderId: null, currentBid: 0 }
        });
        io.emit('auction:update', { message: `Player Skipped` });
        io.emit('auction:skip');
      }
    } catch (e) { console.error(e); }
  });

  socket.on('admin:sellPlayer', async () => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (!settings || !settings.currentPlayerId || !settings.highestBidderId) return;

      const player = await prisma.player.update({
        where: { id: settings.currentPlayerId },
        data: { status: 'SOLD', teamId: settings.highestBidderId }
      });

      const team = await prisma.team.findUnique({ where: { id: settings.highestBidderId } });
      if (team) {
        await prisma.team.update({
          where: { id: team.id },
          data: { remainingPurse: team.remainingPurse - settings.currentBid }
        });
      }

      await prisma.auctionSettings.update({
        where: { id: settings.id },
        data: { status: 'PENDING', isPaused: false, currentPlayerId: null, highestBidderId: null, currentBid: 0 }
      });

      io.emit('auction:sold', { player, team, amount: settings.currentBid });
      io.emit('auction:update', { message: `${player.name} sold to ${team?.name}!` });
    } catch (e) { console.error(e); }
  });

  socket.on('admin:unsoldPlayer', async () => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (!settings || !settings.currentPlayerId) return;

      const player = await prisma.player.update({
        where: { id: settings.currentPlayerId },
        data: { status: 'UNSOLD' }
      });

      await prisma.auctionSettings.update({
        where: { id: settings.id },
        data: { status: 'PENDING', isPaused: false, currentPlayerId: null, highestBidderId: null, currentBid: 0 }
      });

      io.emit('auction:unsold', { player });
      io.emit('auction:update', { message: `${player.name} went unsold.` });
    } catch (e) { console.error(e); }
  });

  // Team actions
  socket.on('team:placeBid', async (data: { teamId: string }) => {
    try {
      const settings = await prisma.auctionSettings.findFirst();
      if (!settings || settings.status !== 'ACTIVE' || settings.isPaused || !settings.currentPlayerId) return;

      const team = await prisma.team.findUnique({ where: { id: data.teamId } });
      if (!team) return;

      let newBidAmount = settings.currentBid;
      if (settings.highestBidderId === null) {
        // First bid is base price
      } else {
        newBidAmount += settings.bidIncrement;
      }

      if (team.remainingPurse < newBidAmount) return; // Insufficient funds
      if (settings.highestBidderId === team.id) return; // Already highest bidder

      await prisma.bid.create({
        data: {
          amount: newBidAmount,
          playerId: settings.currentPlayerId,
          teamId: team.id
        }
      });

      await prisma.auctionSettings.update({
        where: { id: settings.id },
        data: {
          currentBid: newBidAmount,
          highestBidderId: team.id,
          timer: 30 // Reset timer
        }
      });

      io.emit('auction:newBid', { teamId: team.id, teamName: team.name, amount: newBidAmount });
      io.emit('auction:timer', { timer: 30 }); // Optimistic emit
      io.emit('auction:update', { message: 'New bid received!' });
    } catch (e) { console.error(e); }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
