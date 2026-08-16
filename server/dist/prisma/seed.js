"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    // Create admin user
    const adminPassword = await bcrypt_1.default.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@auction.com' },
        update: {},
        create: {
            email: 'admin@auction.com',
            password: adminPassword,
            name: 'Super Admin',
            role: 'ADMIN',
        },
    });
    // Create teams
    const teams = [
        { name: 'Mumbai Indians', color: '#004BA0', initialPurse: 100000000, remainingPurse: 100000000 },
        { name: 'Chennai Super Kings', color: '#FFFF3C', initialPurse: 100000000, remainingPurse: 100000000 },
        { name: 'Royal Challengers Bangalore', color: '#EC1C24', initialPurse: 100000000, remainingPurse: 100000000 }
    ];
    for (const t of teams) {
        const team = await prisma.team.upsert({
            where: { name: t.name },
            update: {},
            create: t,
        });
        // Create a user for each team
        const teamUserPass = await bcrypt_1.default.hash('team123', 10);
        const teamEmail = `${t.name.split(' ').map(w => w[0]).join('').toLowerCase()}@auction.com`;
        await prisma.user.upsert({
            where: { email: teamEmail },
            update: {},
            create: {
                email: teamEmail,
                password: teamUserPass,
                name: t.name + ' Owner',
                role: 'TEAM',
                teamId: team.id
            }
        });
    }
    // Create some players
    const players = [
        { name: 'Virat Kohli', role: 'Batsman', basePrice: 20000000, status: 'AVAILABLE', overallRating: 95 },
        { name: 'MS Dhoni', role: 'Wicketkeeper', basePrice: 15000000, status: 'AVAILABLE', overallRating: 92 },
        { name: 'Rohit Sharma', role: 'Batsman', basePrice: 20000000, status: 'AVAILABLE', overallRating: 94 },
        { name: 'Jasprit Bumrah', role: 'Bowler', basePrice: 20000000, status: 'AVAILABLE', overallRating: 96 },
        { name: 'Hardik Pandya', role: 'All-Rounder', basePrice: 15000000, status: 'AVAILABLE', overallRating: 91 }
    ];
    for (const p of players) {
        await prisma.player.create({
            data: p
        });
    }
    // Create auction settings
    await prisma.auctionSettings.create({
        data: {
            status: 'PENDING',
            bidIncrement: 500000, // 5 Lakhs
            timer: 30
        }
    });
    console.log('Seed data inserted successfully!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map