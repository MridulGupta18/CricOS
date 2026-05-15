/**
 * CALGARY CRICKET SEED SCRIPT
 *
 * Creates a full, realistic league via actual API endpoints — no Prisma direct access.
 * Every record is created the same way a real user would create it through the app.
 *
 * Usage:
 *   SEED_MASTER_EMAIL=... MASTER_PASSWORD=... npx tsx scripts/seed-calgary-league.ts
 *   npx tsx scripts/seed-calgary-league.ts --api https://your-railway-url.up.railway.app \
 *     --master-email you@example.com --master-password yourpassword
 *
 * Prerequisites:
 *   1. API is running (local or deployed)
 *   2. The master account is registered and has MASTER role
 *      (run POST /api/v1/admin/bootstrap after registration)
 *   3. Provide credentials via --master-email/--master-password or env vars.
 */

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag: string, fallback = '') => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : fallback;
};

const API_BASE = get('--api', process.env.SEED_API_URL ?? 'http://localhost:4000') + '/api/v1';
const MASTER_EMAIL = get('--master-email', process.env.SEED_MASTER_EMAIL ?? '');
const MASTER_PASS  = get('--master-password', process.env.MASTER_PASSWORD ?? '');

if (!MASTER_EMAIL || !MASTER_PASS) {
  console.error('✗ Missing credentials. Set SEED_MASTER_EMAIL + MASTER_PASSWORD env vars or pass --master-email/--master-password.');
  process.exit(1);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

let currentToken = '';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token || currentToken ? { Authorization: `Bearer ${token ?? currentToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as any;
  if (!json.success) {
    // Silently skip conflict (409) — already seeded
    if (res.status === 409) return json as T;
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.error)}`);
  }
  return json as T;
}

const post  = <T>(path: string, body?: unknown) => request<T>('POST',  path, body);
const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body);
const get2  = <T>(path: string)                 => request<T>('GET',   path);

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

// ── Real Calgary Data ─────────────────────────────────────────────────────────

const LEAGUE = {
  name:            'Calgary Premier T20 League 2025',
  slug:            'calgary-premier-t20-2025',
  description:     'Alberta\'s flagship T20 competition. Six teams, two months of cricket across Calgary\'s finest grounds. Sponsored by the Calgary Cricket Association.',
  format:          'T20',
  overs:           20,
  startDate:       '2025-06-07T10:00:00.000Z',
  endDate:         '2025-08-16T20:00:00.000Z',
  registrationFee: 0,
  currency:        'CAD',
  maxTeams:        6,
  isPublic:        true,
  city:            'Calgary',
  country:         'Canada',
  rules:           'ICC T20 Playing Conditions apply. DLS method in case of rain interruptions. Super over on tied matches in knockouts.',
};

const TEAMS = [
  { name: 'Calgary Strikers CC',   shortName: 'CSC', city: 'Calgary', country: 'Canada' },
  { name: 'Foothills Thunder CC',  shortName: 'FTC', city: 'Calgary', country: 'Canada' },
  { name: 'Prairie Wolves CC',     shortName: 'PWC', city: 'Calgary', country: 'Canada' },
  { name: 'Rocky Mountain XI',     shortName: 'RMX', city: 'Calgary', country: 'Canada' },
];

// Players per team: [name, role, jerseyNumber, isCaptain, isViceCaptain]
type PlayerSpec = {
  name: string; role: string; jersey: number;
  isCaptain?: boolean; isViceCaptain?: boolean;
  email?: string; // set for players who need a user account (scorer-eligible)
};

// PlayerRole enum values (must match Prisma schema):
//   BATSMAN | BOWLER | ALL_ROUNDER | WICKET_KEEPER
// TeamMember role values: CAPTAIN | VICE_CAPTAIN | PLAYER

const SQUADS: Record<string, PlayerSpec[]> = {
  'Calgary Strikers CC': [
    { name: 'Arjun Sharma',      role: 'WICKET_KEEPER', jersey: 1,  isCaptain: true,      email: 'arjun.sharma@calgarycricket.ca' },
    { name: 'Rahul Patel',       role: 'BATSMAN',       jersey: 3,  isViceCaptain: true,  email: 'rahul.patel@calgarycricket.ca'  },
    { name: 'Vikram Nair',       role: 'BATSMAN',       jersey: 2  },
    { name: 'Karan Mehta',       role: 'ALL_ROUNDER',   jersey: 4  },
    { name: 'Deepak Singh',      role: 'ALL_ROUNDER',   jersey: 5  },
    { name: 'Sachin Rao',        role: 'BATSMAN',       jersey: 6  },
    { name: 'Amit Verma',        role: 'BOWLER',        jersey: 7  },
    { name: 'Prashant Joshi',    role: 'BOWLER',        jersey: 8  },
    { name: 'Rajesh Gupta',      role: 'BOWLER',        jersey: 9  },
    { name: 'Naveen Pillai',     role: 'BOWLER',        jersey: 10 },
    { name: 'Suresh Kumar',      role: 'BOWLER',        jersey: 11 },
    { name: 'Tyler Williams',    role: 'BATSMAN',       jersey: 12 },
  ],
  'Foothills Thunder CC': [
    { name: 'Gurpreet Singh',    role: 'WICKET_KEEPER', jersey: 1,  isCaptain: true,      email: 'gurpreet.singh@calgarycricket.ca'   },
    { name: 'Mandeep Dhaliwal', role: 'BATSMAN',        jersey: 3,  isViceCaptain: true,  email: 'mandeep.dhaliwal@calgarycricket.ca' },
    { name: 'Jaskaran Brar',    role: 'BATSMAN',        jersey: 2  },
    { name: 'Harjot Grewal',    role: 'ALL_ROUNDER',    jersey: 4  },
    { name: 'Simrandeep Gill',  role: 'ALL_ROUNDER',    jersey: 5  },
    { name: 'Parminder Sandhu', role: 'ALL_ROUNDER',    jersey: 6  },
    { name: 'Kulwant Dhillon',  role: 'BOWLER',         jersey: 7  },
    { name: 'Amrit Sidhu',      role: 'BATSMAN',        jersey: 8  },
    { name: 'Tejinder Mann',    role: 'ALL_ROUNDER',    jersey: 9  },
    { name: 'Baldev Rangi',     role: 'BOWLER',         jersey: 10 },
    { name: 'Jason Chen',       role: 'BATSMAN',        jersey: 11 },
    { name: 'Matthew Taylor',   role: 'BOWLER',         jersey: 12 },
  ],
  'Prairie Wolves CC': [
    { name: 'Mohammad Iqbal',    role: 'WICKET_KEEPER', jersey: 1,  isCaptain: true,      email: 'mohammad.iqbal@calgarycricket.ca' },
    { name: 'Bilal Khalid',      role: 'BATSMAN',       jersey: 3,  isViceCaptain: true,  email: 'bilal.khalid@calgarycricket.ca'   },
    { name: 'Usman Tariq',       role: 'BATSMAN',       jersey: 2  },
    { name: 'Zafar Ali',         role: 'ALL_ROUNDER',   jersey: 4  },
    { name: 'Hamid Sheikh',      role: 'ALL_ROUNDER',   jersey: 5  },
    { name: 'Imran Butt',        role: 'BOWLER',        jersey: 6  },
    { name: 'Waseem Ahmed',      role: 'BOWLER',        jersey: 7  },
    { name: 'Asad Mahmood',      role: 'BATSMAN',       jersey: 8  },
    { name: 'Faisal Khan',       role: 'ALL_ROUNDER',   jersey: 9  },
    { name: 'Kashif Raza',       role: 'BOWLER',        jersey: 10 },
    { name: 'Akash Patel',       role: 'BATSMAN',       jersey: 11 },
    { name: 'Luke Robertson',    role: 'BOWLER',        jersey: 12 },
  ],
  'Rocky Mountain XI': [
    { name: 'Arun Krishnan',      role: 'WICKET_KEEPER', jersey: 1,  isCaptain: true,      email: 'arun.krishnan@calgarycricket.ca'     },
    { name: 'Venkat Subramanian', role: 'BATSMAN',        jersey: 3,  isViceCaptain: true,  email: 'venkat.subramanian@calgarycricket.ca' },
    { name: 'Karthik Nair',       role: 'BATSMAN',        jersey: 2  },
    { name: 'Prashanth Reddy',    role: 'ALL_ROUNDER',    jersey: 4  },
    { name: 'Srikanth Iyer',      role: 'ALL_ROUNDER',    jersey: 5  },
    { name: 'Vivek Menon',        role: 'ALL_ROUNDER',    jersey: 6  },
    { name: 'Abhishek Datta',     role: 'BOWLER',         jersey: 7  },
    { name: 'Rohan Ghosh',        role: 'ALL_ROUNDER',    jersey: 8  },
    { name: 'Anup Das',           role: 'BOWLER',         jersey: 9  },
    { name: 'Ahmed Hassan',       role: 'BATSMAN',        jersey: 10 },
    { name: 'David Murphy',       role: 'BOWLER',         jersey: 11 },
    { name: 'Siddharth Roy',      role: 'BATSMAN',        jersey: 12 },
  ],
};

// Round-robin schedule — 6 match days, 1 match per day at Tom Brook
const MATCH_SCHEDULE = [
  { home: 'Calgary Strikers CC',  away: 'Foothills Thunder CC', date: '2025-06-07T10:00:00.000Z', venue: 'Tom Brook Athletic Park', city: 'Calgary' },
  { home: 'Prairie Wolves CC',    away: 'Rocky Mountain XI',    date: '2025-06-14T10:00:00.000Z', venue: 'Tom Brook Athletic Park', city: 'Calgary' },
  { home: 'Calgary Strikers CC',  away: 'Prairie Wolves CC',    date: '2025-06-21T10:00:00.000Z', venue: 'Confederation Park Cricket Ground', city: 'Calgary' },
  { home: 'Foothills Thunder CC', away: 'Rocky Mountain XI',    date: '2025-06-21T14:00:00.000Z', venue: 'Confederation Park Cricket Ground', city: 'Calgary' },
  { home: 'Calgary Strikers CC',  away: 'Rocky Mountain XI',    date: '2025-06-28T10:00:00.000Z', venue: 'Foothills Athletic Park', city: 'Calgary' },
  { home: 'Foothills Thunder CC', away: 'Prairie Wolves CC',    date: '2025-06-28T14:00:00.000Z', venue: 'Foothills Athletic Park', city: 'Calgary' },
];

// ── Seed Logic ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏏  CricOS Calgary League Seed');
  console.log(`   API: ${API_BASE}`);
  console.log(`   Master: ${MASTER_EMAIL}\n`);

  // ── 1. Login as master ────────────────────────────────────────
  log('🔑', 'Logging in as master...');
  const loginRes = await post<any>('/auth/login', { email: MASTER_EMAIL, password: MASTER_PASS });
  if (!loginRes.data?.accessToken) {
    console.error('❌  Login failed — is the API running and is your master account set up?');
    console.error('    Run: POST /api/v1/admin/bootstrap after registering your account');
    process.exit(1);
  }
  currentToken = loginRes.data.accessToken;
  log('✅', `Logged in as ${loginRes.data.user.name} (${loginRes.data.user.role})`);

  // ── 2. Create organizer account ───────────────────────────────
  log('👤', 'Setting up organizer account...');
  const orgEmail = 'organizer@calgarycricket.ca';
  let orgToken   = '';
  let organizerId = '';

  // Try to register; if exists, just login
  try {
    const regRes = await post<any>('/auth/register', {
      email: orgEmail, password: 'Organizer@Calgary2025!',
      name: 'Calgary Cricket Association', role: 'VIEWER',
      acceptedTerms: true,
    });
    if (regRes.data?.user) {
      log('  ✓', `Registered organizer: ${regRes.data.user.id}`);
      organizerId = regRes.data.user.id;
      orgToken    = regRes.data.accessToken;
    }
  } catch {}

  if (!organizerId) {
    // Already exists — login
    try {
      const loginOrg = await post<any>('/auth/login', { email: orgEmail, password: 'Organizer@Calgary2025!' });
      organizerId = loginOrg.data.user.id;
      orgToken    = loginOrg.data.accessToken;
      log('  ✓', `Organizer already exists, logged in`);
    } catch {
      // Registered but different password — get from admin
      const usersRes = await get2<any>('/admin/users?limit=100');
      const orgUser  = usersRes.data?.find((u: any) => u.email === orgEmail);
      if (orgUser) organizerId = orgUser.id;
    }
  }

  // Promote to ORGANIZER if not already
  if (organizerId) {
    try {
      await patch(`/admin/users/${organizerId}/role`, { role: 'ORGANIZER' });
      log('  ✓', 'Promoted organizer to ORGANIZER role');
    } catch {
      log('  ✓', 'Organizer already at correct role');
    }
    // Re-login to get fresh token with ORGANIZER role
    const reLogin = await post<any>('/auth/login', { email: orgEmail, password: 'Organizer@Calgary2025!' });
    orgToken = reLogin.data?.accessToken ?? orgToken;
  }

  // ── 3. Register player user accounts (captains + vice-captains need user accounts to be eligible scorers) ──
  log('👥', 'Registering captain/VC user accounts...');
  const userIdByEmail: Record<string, string> = {};
  const allPlayerSpecs = Object.values(SQUADS).flat().filter(p => p.email);

  for (const player of allPlayerSpecs) {
    if (!player.email) continue;
    try {
      const r = await post<any>('/auth/register', {
        email: player.email, password: 'Player@Calgary2025!',
        name: player.name, role: 'PLAYER',
        acceptedTerms: true,
      });
      if (r.data?.user) {
        userIdByEmail[player.email] = r.data.user.id;
        log('  ✓', `Registered ${player.name}`);
      }
    } catch {
      // Already exists — find via admin
    }
  }

  // Fill in any that already existed
  const usersRes = await get2<any>('/admin/users?limit=200');
  if (usersRes.data) {
    for (const u of usersRes.data) {
      if (!userIdByEmail[u.email]) userIdByEmail[u.email] = u.id;
    }
  }

  // ── 4. Create teams ───────────────────────────────────────────
  log('🏏', 'Creating teams...');
  const teamIdByName: Record<string, string> = {};

  // Use organizer token for team creation
  const savedToken = currentToken;
  currentToken = orgToken;

  for (const team of TEAMS) {
    try {
      const res = await post<any>('/teams', team);
      if (res.data?.id) {
        teamIdByName[team.name] = res.data.id;
        log('  ✓', `${team.name} (${team.shortName})`);
      }
    } catch (err: any) {
      // Might be 409 conflict — search for existing
    }
  }

  // For any teams we didn't get IDs for, search them
  if (Object.keys(teamIdByName).length < TEAMS.length) {
    for (const team of TEAMS) {
      if (!teamIdByName[team.name]) {
        const search = await get2<any>(`/search?q=${encodeURIComponent(team.shortName)}&type=TEAM`);
        const found = search.data?.find((r: any) => r.name === team.name || r.shortName === team.shortName);
        if (found) teamIdByName[team.name] = found.id;
      }
    }
  }

  // ── 5. Create player profiles and add to teams ────────────────
  log('👤', 'Creating player profiles...');
  const playerIdByName: Record<string, string> = {};

  for (const [teamName, squad] of Object.entries(SQUADS)) {
    const teamId = teamIdByName[teamName];
    if (!teamId) { log('  ⚠', `Team ${teamName} not found — skipping players`); continue; }
    log('  🏏', `Building squad for ${teamName}...`);

    for (const spec of squad) {
      // Create player profile
      let playerId = '';
      const linkedUserId = spec.email ? userIdByEmail[spec.email] : undefined;

      try {
        const createRes = await post<any>('/players', {
          name:         spec.name,
          role:         spec.role,
          jerseyNumber: spec.jersey,
          country:      'Canada',
          ...(linkedUserId ? { userId: linkedUserId } : {}),
        });
        if (createRes.data?.id) {
          playerId = createRes.data.id;
        }
      } catch {}

      if (!playerId) {
        // Try to find existing player by searching
        const search = await get2<any>(`/players?limit=200`);
        const existing = search.data?.find((p: any) => p.name === spec.name);
        if (existing) playerId = existing.id;
      }

      if (playerId) {
        playerIdByName[spec.name] = playerId;
        // Add to team
        try {
          await post(`/teams/${teamId}/players`, {
            playerId,
            role: spec.isCaptain ? 'CAPTAIN' : spec.isViceCaptain ? 'VICE_CAPTAIN' : 'PLAYER',
          });
          const badge = spec.isCaptain ? ' [C]' : spec.isViceCaptain ? ' [VC]' : '';
          log('    +', `${spec.name}${badge} #${spec.jersey}`);
        } catch {}
      }
    }
  }

  // ── 6. Create the league ──────────────────────────────────────
  log('🏆', 'Creating league...');
  let leagueId = '';

  try {
    const leagueRes = await post<any>('/leagues', LEAGUE);
    if (leagueRes.data?.id) {
      leagueId = leagueRes.data.id;
      log('  ✓', `Created: ${LEAGUE.name} (${leagueRes.data.slug})`);
    }
  } catch (err: any) {
    // Already exists — find by slug
    const existing = await get2<any>(`/leagues/${LEAGUE.slug}`);
    if (existing.data?.id) {
      leagueId = existing.data.id;
      log('  ✓', `Found existing league: ${leagueId}`);
    }
  }

  if (!leagueId) {
    log('⚠', 'Could not create or find league — check organizer permissions');
    currentToken = savedToken;
    return;
  }

  // ── 7. Set league status to REGISTRATION_OPEN ────────────────
  try {
    await patch(`/leagues/${leagueId}/status`, { status: 'REGISTRATION_OPEN' });
    log('  ✓', 'League status → REGISTRATION_OPEN');
  } catch {}

  // ── 8. Register teams in the league ──────────────────────────
  log('📋', 'Registering teams in league...');
  for (const team of TEAMS) {
    const teamId = teamIdByName[team.name];
    if (!teamId) continue;
    try {
      await post(`/leagues/${leagueId}/teams`, { teamId });
      log('  ✓', `${team.name} registered`);
    } catch {
      log('  ✓', `${team.name} already registered`);
    }
  }

  // ── 9. Create match schedule ──────────────────────────────────
  log('📅', 'Creating match schedule...');
  const createdMatches: { id: string; home: string; away: string; date: string; venue: string }[] = [];

  for (const fixture of MATCH_SCHEDULE) {
    const homeTeamId = teamIdByName[fixture.home];
    const awayTeamId = teamIdByName[fixture.away];
    if (!homeTeamId || !awayTeamId) {
      log('  ⚠', `Skipping ${fixture.home} vs ${fixture.away} — team IDs missing`);
      continue;
    }

    try {
      const matchRes = await post<any>('/matches', {
        homeTeamId, awayTeamId,
        venue:       fixture.venue,
        city:        fixture.city,
        scheduledAt: fixture.date,
        format:      'T20',
        overs:       20,
        leagueId,
        isPublic:    true,
        title:       `${fixture.home.replace(' CC', '').replace(' XI', '')} vs ${fixture.away.replace(' CC', '').replace(' XI', '')}`,
      });
      if (matchRes.data?.id) {
        createdMatches.push({ id: matchRes.data.id, home: fixture.home, away: fixture.away, date: fixture.date, venue: fixture.venue });
        const d = new Date(fixture.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
        log('  ✓', `${fixture.home.split(' ')[0]} vs ${fixture.away.split(' ')[0]} — ${d} @ ${fixture.venue}`);
      }
    } catch (err: any) {
      log('  ⚠', `Match creation failed: ${err.message}`);
    }
  }

  currentToken = savedToken;

  // ── 10. Summary ───────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('✅  Calgary Premier T20 League 2025 — Seed Complete\n');
  console.log(`   League ID  : ${leagueId}`);
  console.log(`   League URL : /league/${LEAGUE.slug}`);
  console.log(`   Teams      : ${Object.keys(teamIdByName).length}/${TEAMS.length}`);
  console.log(`   Players    : ${Object.keys(playerIdByName).length}`);
  console.log(`   Matches    : ${createdMatches.length}/${MATCH_SCHEDULE.length}`);

  if (createdMatches.length > 0) {
    console.log('\n   Match IDs (for scoring):');
    for (const m of createdMatches) {
      const d = new Date(m.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
      console.log(`     ${m.home.split(' ')[0].padEnd(10)} vs ${m.away.split(' ')[0].padEnd(10)} — ${d} — ${m.id}`);
    }
  }

  console.log('\n   Organizer login:');
  console.log(`     Email   : ${orgEmail}`);
  console.log(`     Password: Organizer@Calgary2025!`);
  console.log('\n   Captain accounts (scorer-eligible):');
  for (const spec of allPlayerSpecs) {
    if (spec.isCaptain && spec.email) {
      const teamName = Object.entries(SQUADS).find(([, sq]) => sq.includes(spec))?.[0] ?? '';
      console.log(`     ${spec.name.padEnd(22)} ${spec.email.padEnd(38)} Password: Player@Calgary2025!  [${teamName.split(' ')[0]}]`);
    }
  }
  console.log('\n' + '─'.repeat(60) + '\n');
}

main().catch(err => {
  console.error('\n❌  Seed failed:', err.message ?? err);
  process.exit(1);
});
