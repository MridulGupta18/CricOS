import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Calgary Premier Cricket League 2025 ────────────────────────

const TEAMS = [
  { id: 'clg-t1', name: 'Calgary Warriors',        shortName: 'CAW', city: 'Calgary' },
  { id: 'clg-t2', name: 'Rocky Mountain Raptors',  shortName: 'RMR', city: 'Calgary' },
  { id: 'clg-t3', name: 'Stampede Cricket Club',   shortName: 'STM', city: 'Calgary' },
  { id: 'clg-t4', name: 'Prairie Falcons',         shortName: 'PRF', city: 'Calgary' },
  { id: 'clg-t5', name: 'Foothills United',        shortName: 'FHU', city: 'Calgary' },
  { id: 'clg-t6', name: 'Chinook Blazers',         shortName: 'CHB', city: 'Calgary' },
];

const PLAYERS: { id: string; name: string; teamIdx: number; role: any; battingStyle: any; jersey: number }[] = [
  // Calgary Warriors (team 0)
  { id: 'clg-p1',  name: 'Arjun Mehta',       teamIdx: 0, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 18 },
  { id: 'clg-p2',  name: 'Rajan Singh',        teamIdx: 0, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 7  },
  { id: 'clg-p3',  name: 'Dev Patel',          teamIdx: 0, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 3  },
  { id: 'clg-p4',  name: 'Kiran Sharma',       teamIdx: 0, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 12 },
  { id: 'clg-p5',  name: 'Ansh Gupta',         teamIdx: 0, role: 'ALL_ROUNDER',  battingStyle: 'LEFT_HAND',  jersey: 9  },
  { id: 'clg-p6',  name: 'Raj Verma',          teamIdx: 0, role: 'WICKET_KEEPER',battingStyle: 'RIGHT_HAND', jersey: 1  },
  { id: 'clg-p7',  name: 'Harsh Agarwal',      teamIdx: 0, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 22 },
  { id: 'clg-p8',  name: 'Siddharth Kumar',    teamIdx: 0, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 11 },
  { id: 'clg-p9',  name: 'Vikram Bose',        teamIdx: 0, role: 'BOWLER',       battingStyle: 'LEFT_HAND',  jersey: 5  },
  { id: 'clg-p10', name: 'Amit Shah',          teamIdx: 0, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 33 },
  { id: 'clg-p11', name: 'Priyesh Nair',       teamIdx: 0, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 16 },
  // Rocky Mountain Raptors (team 1)
  { id: 'clg-p12', name: 'Zaid Hussain',       teamIdx: 1, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 10 },
  { id: 'clg-p13', name: 'Omar Khan',          teamIdx: 1, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 4  },
  { id: 'clg-p14', name: 'Bilal Ahmed',        teamIdx: 1, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 8  },
  { id: 'clg-p15', name: 'Hassan Malik',       teamIdx: 1, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 14 },
  { id: 'clg-p16', name: 'Faisal Iqbal',       teamIdx: 1, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 2  },
  { id: 'clg-p17', name: 'Adeel Rashid',       teamIdx: 1, role: 'WICKET_KEEPER',battingStyle: 'LEFT_HAND',  jersey: 6  },
  { id: 'clg-p18', name: 'Usman Ghani',        teamIdx: 1, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 17 },
  { id: 'clg-p19', name: 'Tariq Mahmood',      teamIdx: 1, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 19 },
  { id: 'clg-p20', name: 'Shoaib Mir',         teamIdx: 1, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 23 },
  { id: 'clg-p21', name: 'Imran Asif',         teamIdx: 1, role: 'BOWLER',       battingStyle: 'LEFT_HAND',  jersey: 25 },
  { id: 'clg-p22', name: 'Kamran Elahi',       teamIdx: 1, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 30 },
  // Stampede CC (team 2)
  { id: 'clg-p23', name: 'Gurpreet Singh',     teamIdx: 2, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 13 },
  { id: 'clg-p24', name: 'Manpreet Bains',     teamIdx: 2, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 5  },
  { id: 'clg-p25', name: 'Harjit Dhaliwal',    teamIdx: 2, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 21 },
  { id: 'clg-p26', name: 'Jaswinder Gill',     teamIdx: 2, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 9  },
  { id: 'clg-p27', name: 'Sukhbir Randhawa',   teamIdx: 2, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 7  },
  { id: 'clg-p28', name: 'Gurjit Brar',        teamIdx: 2, role: 'WICKET_KEEPER',battingStyle: 'RIGHT_HAND', jersey: 1  },
  { id: 'clg-p29', name: 'Parminder Sidhu',    teamIdx: 2, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 15 },
  { id: 'clg-p30', name: 'Navdeep Aulakh',     teamIdx: 2, role: 'BOWLER',       battingStyle: 'LEFT_HAND',  jersey: 11 },
  { id: 'clg-p31', name: 'Baljit Sandhu',      teamIdx: 2, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 28 },
  { id: 'clg-p32', name: 'Jagjit Sekhon',      teamIdx: 2, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 20 },
  { id: 'clg-p33', name: 'Amrik Johal',        teamIdx: 2, role: 'ALL_ROUNDER',  battingStyle: 'LEFT_HAND',  jersey: 3  },
  // Prairie Falcons (team 3)
  { id: 'clg-p34', name: 'Michael Thompson',   teamIdx: 3, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 27 },
  { id: 'clg-p35', name: 'Kabir Ali',          teamIdx: 3, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 6  },
  { id: 'clg-p36', name: 'Ryan Patel',         teamIdx: 3, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 12 },
  { id: 'clg-p37', name: 'Sam Noronha',        teamIdx: 3, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 4  },
  { id: 'clg-p38', name: 'Chris D\'Souza',     teamIdx: 3, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 8  },
  { id: 'clg-p39', name: 'James Fernandez',    teamIdx: 3, role: 'WICKET_KEEPER',battingStyle: 'RIGHT_HAND', jersey: 1  },
  { id: 'clg-p40', name: 'David Rodrigues',    teamIdx: 3, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 17 },
  { id: 'clg-p41', name: 'Alex Joseph',        teamIdx: 3, role: 'BOWLER',       battingStyle: 'LEFT_HAND',  jersey: 22 },
  { id: 'clg-p42', name: 'Kevin Mathews',      teamIdx: 3, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 10 },
  { id: 'clg-p43', name: "Nathan D'Costa",     teamIdx: 3, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 14 },
  { id: 'clg-p44', name: 'Adrian Pereira',     teamIdx: 3, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 31 },
  // Foothills United (team 4)
  { id: 'clg-p45', name: 'Sachin Nair',        teamIdx: 4, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 10 },
  { id: 'clg-p46', name: 'Saurabh Tiwari',     teamIdx: 4, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 19 },
  { id: 'clg-p47', name: 'Nitin Mishra',       teamIdx: 4, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 8  },
  { id: 'clg-p48', name: 'Deepak Yadav',       teamIdx: 4, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 5  },
  { id: 'clg-p49', name: 'Rahul Nair',         teamIdx: 4, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 3  },
  { id: 'clg-p50', name: 'Vikas Saxena',       teamIdx: 4, role: 'WICKET_KEEPER',battingStyle: 'RIGHT_HAND', jersey: 1  },
  { id: 'clg-p51', name: 'Pankaj Tripathi',    teamIdx: 4, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 16 },
  { id: 'clg-p52', name: 'Manish Dubey',       teamIdx: 4, role: 'BOWLER',       battingStyle: 'LEFT_HAND',  jersey: 24 },
  { id: 'clg-p53', name: 'Gaurav Kapoor',      teamIdx: 4, role: 'ALL_ROUNDER',  battingStyle: 'RIGHT_HAND', jersey: 11 },
  { id: 'clg-p54', name: 'Ravi Shankar',       teamIdx: 4, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 32 },
  { id: 'clg-p55', name: 'Tushar Joshi',       teamIdx: 4, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 26 },
  // Chinook Blazers (team 5)
  { id: 'clg-p56', name: 'Abdullah Rahman',    teamIdx: 5, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 7  },
  { id: 'clg-p57', name: 'Hamza Baig',         teamIdx: 5, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 11 },
  { id: 'clg-p58', name: 'Tariq Ali',          teamIdx: 5, role: 'ALL_ROUNDER',  battingStyle: 'LEFT_HAND',  jersey: 16 },
  { id: 'clg-p59', name: 'Umar Farooq',        teamIdx: 5, role: 'BATSMAN',      battingStyle: 'RIGHT_HAND', jersey: 4  },
  { id: 'clg-p60', name: 'Nasir Ahmed',        teamIdx: 5, role: 'BATSMAN',      battingStyle: 'LEFT_HAND',  jersey: 9  },
  { id: 'clg-p61', name: 'Wahid Khan',         teamIdx: 5, role: 'WICKET_KEEPER',battingStyle: 'RIGHT_HAND', jersey: 1  },
  { id: 'clg-p62', name: 'Shahid Mir',         teamIdx: 5, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 13 },
  { id: 'clg-p63', name: 'Aqeel Butt',         teamIdx: 5, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 20 },
  { id: 'clg-p64', name: 'Raza Siddiqui',      teamIdx: 5, role: 'ALL_ROUNDER',  battingStyle: 'LEFT_HAND',  jersey: 6  },
  { id: 'clg-p65', name: 'Salman Haider',      teamIdx: 5, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 29 },
  { id: 'clg-p66', name: 'Irfan Mirza',        teamIdx: 5, role: 'BOWLER',       battingStyle: 'RIGHT_HAND', jersey: 18 },
];

// venue pool
const VENUES = [
  'Max Bell Centre',
  'Castleridge Cricket Ground',
  'West Hills Cricket Ground',
  'Chinook Park Ground',
  'McKnight Meadows Oval',
];

// Completed match definitions:
// [homeTeamIdx, awayTeamIdx, homeRuns, homeWkts, homeOvers*10, awayRuns, awayWkts, awayOvers*10, homeWon, daysAgo]
const COMPLETED: [number,number,number,number,number,number,number,number,boolean,number][] = [
  [0,1, 167,6,200, 152,8,200, true,  28],  // Warriors vs Raptors
  [0,2, 135,3,173, 134,8,200, true,  24],  // Warriors vs Stampede (chased)
  [0,3, 189,4,200, 144,9,200, true,  21],  // Warriors vs Prairie
  [0,4, 113,2,131, 112,10,187, true, 18],  // Warriors vs Foothills (chased)
  [0,5, 196,5,200, 104,10,163, true, 14],  // Warriors vs Chinook
  [1,2, 157,6,194, 156,7,200, true,  26],  // Raptors vs Stampede (chased)
  [1,3, 172,5,200, 150,8,200, true,  22],  // Raptors vs Prairie
  [1,4, 129,4,171, 128,9,200, true,  19],  // Raptors vs Foothills (chased)
  [1,5, 188,4,200, 120,10,192, true, 15],  // Raptors vs Chinook
  [2,3, 149,7,193, 148,7,200, true,  17],  // Stampede vs Prairie (chased)
  [2,4, 178,5,200, 123,10,181, true, 12],  // Stampede vs Foothills
  [2,5, 99,0, 97,  98,10,172, true,   9],  // Stampede vs Chinook (chased 10 wkts)
];

async function main() {
  console.log('🌱 Seeding Calgary Premier Cricket League 2025...');

  // ── Users ──────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@crivos.com' },
    update: {},
    create: { email: 'admin@crivos.com', passwordHash: adminHash, name: 'Admin', role: 'ADMIN', isVerified: true },
  });

  const orgHash = await bcrypt.hash('Org@12345', 12);
  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@crivos.com' },
    update: {},
    create: { email: 'organizer@crivos.com', passwordHash: orgHash, name: 'Calgary Cricket Board', role: 'ORGANIZER', isVerified: true },
  });

  // ── Teams ──────────────────────────────────────────────────────
  const teams = await Promise.all(
    TEAMS.map(t => prisma.team.upsert({
      where: { id: t.id },
      update: {},
      create: { id: t.id, name: t.name, shortName: t.shortName, city: t.city, country: 'Canada' },
    }))
  );

  // ── Players ────────────────────────────────────────────────────
  const players = await Promise.all(
    PLAYERS.map(p => prisma.player.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id, name: p.name, role: p.role, battingStyle: p.battingStyle,
        jerseyNumber: p.jersey, city: 'Calgary', country: 'Canada',
      },
    }))
  );

  // ── Team Members ───────────────────────────────────────────────
  for (const p of PLAYERS) {
    const teamId = teams[p.teamIdx].id;
    const isFirst = PLAYERS.filter(x => x.teamIdx === p.teamIdx).indexOf(p) === 0;
    await prisma.teamMember.upsert({
      where: { teamId_playerId: { teamId, playerId: p.id } },
      update: {},
      create: { teamId, playerId: p.id, role: isFirst ? 'CAPTAIN' : 'PLAYER' },
    });
  }

  // ── League ─────────────────────────────────────────────────────
  const league = await prisma.league.upsert({
    where: { slug: 'calgary-premier-cricket-league-2025' },
    update: {},
    create: {
      slug:             'calgary-premier-cricket-league-2025',
      name:             'Calgary Premier Cricket League 2025',
      description:      'The premier T20 cricket league in Calgary, bringing together the best club teams from across the city.',
      organizerId:      organizer.id,
      format:           'T20',
      overs:            20,
      city:             'Calgary',
      country:          'Canada',
      registrationFee:  150000, // CAD $1500
      currency:         'CAD',
      maxTeams:         8,
      status:           'ONGOING',
      isPublic:         true,
      startDate:        new Date('2025-05-03'),
      endDate:          new Date('2025-07-12'),
      rules:            'Standard ICC T20 rules apply. DLS method used in rain-affected matches. Powerplay: overs 1-6.',
    },
  });

  // ── League Teams with standings ────────────────────────────────
  const standings = [
    { teamIdx: 0, pts: 10, mp: 5, mw: 5, nrr:  2.04 },
    { teamIdx: 1, pts:  8, mp: 5, mw: 4, nrr:  0.89 },
    { teamIdx: 2, pts:  6, mp: 5, mw: 3, nrr:  0.34 },
    { teamIdx: 3, pts:  0, mp: 3, mw: 0, nrr: -0.87 },
    { teamIdx: 4, pts:  0, mp: 3, mw: 0, nrr: -1.23 },
    { teamIdx: 5, pts:  0, mp: 3, mw: 0, nrr: -2.45 },
  ];

  for (const s of standings) {
    await prisma.leagueTeam.upsert({
      where: { leagueId_teamId: { leagueId: league.id, teamId: teams[s.teamIdx].id } },
      update: { pointsEarned: s.pts, matchesPlayed: s.mp, matchesWon: s.mw, nrr: s.nrr, paymentStatus: 'PAID' },
      create: { leagueId: league.id, teamId: teams[s.teamIdx].id, pointsEarned: s.pts, matchesPlayed: s.mp, matchesWon: s.mw, nrr: s.nrr, paymentStatus: 'PAID' },
    });
  }

  // ── Completed Matches with Innings ─────────────────────────────
  for (let i = 0; i < COMPLETED.length; i++) {
    const [hIdx, aIdx, hRuns, hWkts, hOvers10, aRuns, aWkts, aOvers10, homeWon, daysAgo] = COMPLETED[i];
    const matchId = `clg-m${i + 1}`;
    const token   = `clg-match-${i + 1}`;

    const homeWon_ = homeWon;
    const winnerId = homeWon_ ? teams[hIdx].id : teams[aIdx].id;
    const winMargin = homeWon_
      ? (aWkts === 10 ? hRuns - aRuns : null)   // won by runs if all out
      : (10 - aWkts);                            // won by wickets if chased
    const winMarginType = homeWon_
      ? (aWkts === 10 ? 'RUNS' : 'WICKETS')
      : 'WICKETS';

    const scheduledAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const venueIdx    = i % VENUES.length;

    const match = await prisma.match.upsert({
      where: { shareToken: token },
      update: {},
      create: {
        id:          matchId,
        shareToken:  token,
        homeTeamId:  teams[hIdx].id,
        awayTeamId:  teams[aIdx].id,
        leagueId:    league.id,
        creatorId:   organizer.id,
        scorerId:    organizer.id,
        format:      'T20',
        overs:       20,
        venue:       VENUES[venueIdx],
        city:        'Calgary',
        status:      'COMPLETED',
        isPublic:    true,
        scheduledAt,
        tossWinnerId: teams[hIdx].id,
        tossDecision: homeWon_ ? 'BAT' : 'BOWL',
        resultType:   'WIN',
        winnerId,
        winMargin:    winMargin ?? undefined,
        winMarginType: winMarginType as any,
      },
    });

    // Innings 1 (home team bats first)
    const inn1Id = `clg-inn-${i + 1}-1`;
    await prisma.innings.upsert({
      where: { matchId_inningsNumber: { matchId: match.id, inningsNumber: 1 } },
      update: {},
      create: {
        id:             inn1Id,
        matchId:        match.id,
        inningsNumber:  1,
        battingTeamId:  teams[hIdx].id,
        bowlingTeamId:  teams[aIdx].id,
        totalRuns:      hRuns,
        totalWickets:   hWkts,
        completedOvers: Math.floor(hOvers10 / 10),
        extraBalls:     hOvers10 % 10,
        extrasWides:    Math.floor(hRuns * 0.04),
        extrasNoBalls:  Math.floor(hRuns * 0.01),
        isCompleted:    true,
      },
    });

    // Innings 2 (away team chases)
    const inn2Id = `clg-inn-${i + 1}-2`;
    await prisma.innings.upsert({
      where: { matchId_inningsNumber: { matchId: match.id, inningsNumber: 2 } },
      update: {},
      create: {
        id:             inn2Id,
        matchId:        match.id,
        inningsNumber:  2,
        battingTeamId:  teams[aIdx].id,
        bowlingTeamId:  teams[hIdx].id,
        totalRuns:      aRuns,
        totalWickets:   aWkts,
        completedOvers: Math.floor(aOvers10 / 10),
        extraBalls:     aOvers10 % 10,
        extrasWides:    Math.floor(aRuns * 0.04),
        extrasNoBalls:  Math.floor(aRuns * 0.01),
        isCompleted:    true,
      },
    });
  }

  // ── Upcoming Matches ───────────────────────────────────────────
  const upcoming = [
    { id: 'clg-m13', token: 'clg-match-13', hIdx: 3, aIdx: 4, days: 2,  venue: VENUES[0] },
    { id: 'clg-m14', token: 'clg-match-14', hIdx: 3, aIdx: 5, days: 4,  venue: VENUES[1] },
    { id: 'clg-m15', token: 'clg-match-15', hIdx: 4, aIdx: 5, days: 6,  venue: VENUES[2] },
    { id: 'clg-m16', token: 'clg-match-16', hIdx: 0, aIdx: 1, days: 10, venue: VENUES[3] }, // Finals preview rematch
  ];

  for (const u of upcoming) {
    await prisma.match.upsert({
      where: { shareToken: u.token },
      update: {},
      create: {
        id:          u.id,
        shareToken:  u.token,
        homeTeamId:  teams[u.hIdx].id,
        awayTeamId:  teams[u.aIdx].id,
        leagueId:    league.id,
        creatorId:   organizer.id,
        format:      'T20',
        overs:       20,
        venue:       u.venue,
        city:        'Calgary',
        status:      'UPCOMING',
        isPublic:    true,
        scheduledAt: new Date(Date.now() + u.days * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ── Legacy seed match (keep for compat) ────────────────────────
  const legacyHash = await bcrypt.hash('password', 10);
  await prisma.match.upsert({
    where: { shareToken: 'seed-match-001' },
    update: { status: 'CANCELLED' },
    create: {
      shareToken: 'seed-match-001',
      homeTeamId: teams[0].id,
      awayTeamId: teams[1].id,
      creatorId:  organizer.id,
      format:     'T20',
      overs:      20,
      status:     'CANCELLED',
      isPublic:   false,
      scheduledAt: new Date('2024-01-01'),
    },
  });

  console.log('✅ Seed complete!');
  console.log(`   League:    Calgary Premier Cricket League 2025`);
  console.log(`   Teams:     ${TEAMS.length} teams, ${PLAYERS.length} players`);
  console.log(`   Matches:   ${COMPLETED.length} completed, ${upcoming.length} upcoming`);
  console.log(`   Admin:     admin@crivos.com / Admin@123`);
  console.log(`   Organizer: organizer@crivos.com / Org@12345`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
