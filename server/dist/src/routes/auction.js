"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get Dashboard Stats (Admin)
router.get('/stats', async (req, res) => {
    try {
        const totalPlayers = await prisma.player.count();
        const totalTeams = await prisma.team.count();
        const playersSold = await prisma.player.count({ where: { status: 'SOLD' } });
        const playersUnsold = await prisma.player.count({ where: { status: 'UNSOLD' } });
        res.json({ totalPlayers, totalTeams, playersSold, playersUnsold });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
// Get Auction Settings / Current State
router.get('/state', async (req, res) => {
    try {
        let settings = await prisma.auctionSettings.findFirst();
        if (!settings) {
            settings = await prisma.auctionSettings.create({
                data: { status: 'PENDING', bidIncrement: 500000, timer: 30 }
            });
        }
        let currentPlayer = null;
        if (settings.currentPlayerId) {
            currentPlayer = await prisma.player.findUnique({
                where: { id: settings.currentPlayerId },
                include: { bids: { include: { team: true }, orderBy: { amount: 'desc' } } }
            });
        }
        let highestBiddingTeam = null;
        if (settings.highestBidderId) {
            highestBiddingTeam = await prisma.team.findUnique({ where: { id: settings.highestBidderId } });
        }
        res.json({
            settings,
            currentPlayer,
            highestBiddingTeam
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch auction state' });
    }
});
// Get all players
router.get('/players', async (req, res) => {
    try {
        const players = await prisma.player.findMany({
            include: { team: true }
        });
        res.json(players);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});
// Get all teams
router.get('/teams', async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            include: { players: true, user: true }
        });
        res.json(teams);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});
// Create a new team
router.post('/teams', async (req, res) => {
    try {
        const { name, color, initialPurse } = req.body;
        const team = await prisma.team.create({
            data: {
                name,
                color,
                initialPurse: parseInt(initialPurse, 10),
                remainingPurse: parseInt(initialPurse, 10),
            }
        });
        res.json(team);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create team' });
    }
});
// Delete a team
router.delete('/teams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.team.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete team' });
    }
});
// Create a new user (Team Owner)
const bcrypt_1 = __importDefault(require("bcrypt"));
router.post('/users', async (req, res) => {
    try {
        const { email, password, name, teamId } = req.body;
        // Check if team already has an owner
        const existingUser = await prisma.user.findFirst({ where: { teamId } });
        if (existingUser) {
            return res.status(400).json({ error: 'Team already has an owner assigned.' });
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: 'TEAM',
                teamId
            }
        });
        res.json({ id: user.id, email: user.email, name: user.name, teamId: user.teamId });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});
// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({ include: { team: true } });
        res.json(users);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// Delete a user
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
// --- Player Management ---
// Create a new player
router.post('/players', async (req, res) => {
    try {
        const { name, role, basePrice, age, country, category, photoUrl } = req.body;
        const player = await prisma.player.create({
            data: {
                name,
                role,
                basePrice: parseInt(basePrice, 10),
                age: age ? parseInt(age, 10) : null,
                country,
                category,
                photo: photoUrl
            }
        });
        res.json(player);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create player' });
    }
});
// Update a player
router.put('/players/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, basePrice, age, country, category, photoUrl } = req.body;
        const player = await prisma.player.update({
            where: { id },
            data: {
                name,
                role,
                basePrice: parseInt(basePrice, 10),
                age: age ? parseInt(age, 10) : null,
                country,
                category,
                photo: photoUrl
            }
        });
        res.json(player);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update player' });
    }
});
// Bulk create players
router.post('/players/bulk', async (req, res) => {
    try {
        const players = req.body.players;
        if (!Array.isArray(players))
            return res.status(400).json({ error: 'Invalid data format' });
        const created = await prisma.player.createMany({
            data: players.map(p => ({
                name: p.name,
                role: p.role || 'Batsman',
                basePrice: parseInt(p.basePrice, 10),
                age: p.age ? parseInt(p.age, 10) : null,
                country: p.country,
                category: p.category,
                photo: p.photoUrl
            })),
            skipDuplicates: true
        });
        res.json({ success: true, count: created.count });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to bulk upload players' });
    }
});
// Delete a player
router.delete('/players/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.player.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete player' });
    }
});
exports.default = router;
//# sourceMappingURL=auction.js.map