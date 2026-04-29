import { useState } from 'react';
import { View, Text, FlatList, Pressable, StatusBar, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from '@/lib/theme';

// Calgary Premier Cricket League 2025 players
const PLAYERS = [
  { id:'p1',  name:'Arjun Mehta',    role:'Batsman',    team:'Calgary Warriors',  short:'CAW', stat:'847', label:'runs',    avg:56.5, location:'NW Calgary' },
  { id:'p2',  name:'Rohan Patel',    role:'Bowler',     team:'Raptors CC',        short:'RMR', stat:'32',  label:'wickets', avg:18.4, location:'SW Calgary' },
  { id:'p3',  name:'Dev Singh',      role:'All-rounder',team:'Stampede XI',       short:'STM', stat:'621', label:'runs',    avg:41.4, location:'SE Calgary' },
  { id:'p4',  name:'Nikhil Sharma',  role:'Batsman',    team:'Foothills United',  short:'FHU', stat:'712', label:'runs',    avg:47.5, location:'NE Calgary' },
  { id:'p5',  name:'Aakash Verma',   role:'Bowler',     team:'Chinook Blasters',  short:'CHB', stat:'28',  label:'wickets', avg:22.1, location:'Central' },
  { id:'p6',  name:'Priya Nair',     role:'WK-Batsman', team:'Prairie Falcons',   short:'PRF', stat:'534', label:'runs',    avg:38.1, location:'N Calgary' },
  { id:'p7',  name:'Karan Joshi',    role:'Bowler',     team:'Calgary Warriors',  short:'CAW', stat:'41',  label:'wickets', avg:16.8, location:'NW Calgary' },
  { id:'p8',  name:'Vikram Rao',     role:'Batsman',    team:'Raptors CC',        short:'RMR', stat:'689', label:'runs',    avg:49.2, location:'SW Calgary' },
  { id:'p9',  name:'Suresh Kumar',   role:'All-rounder',team:'Stampede XI',       short:'STM', stat:'512', label:'runs',    avg:34.1, location:'SE Calgary' },
  { id:'p10', name:'Ajay Menon',     role:'Bowler',     team:'Foothills United',  short:'FHU', stat:'24',  label:'wickets', avg:26.3, location:'NE Calgary' },
  { id:'p11', name:'Ravi Gupta',     role:'Batsman',    team:'Chinook Blasters',  short:'CHB', stat:'445', label:'runs',    avg:32.5, location:'Central' },
  { id:'p12', name:'Manish Shah',    role:'WK-Batsman', team:'Prairie Falcons',   short:'PRF', stat:'398', label:'runs',    avg:29.8, location:'N Calgary' },
];

const ROLES = [
  { id: 'All',         label: 'All' },
  { id: 'Batsman',     label: 'Batters' },
  { id: 'Bowler',      label: 'Bowlers' },
  { id: 'All-rounder', label: 'All-rounders' },
  { id: 'WK-Batsman',  label: 'Wicket-keepers' },
];

// Matches design's Avatar: initials inside gradient circle
function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2.2,
      backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: C.border,
      flexShrink: 0,
    }}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.32, color: '#fff' }}>{initials}</Text>
    </View>
  );
}

export function PlayersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');

  const filtered = PLAYERS.filter(p =>
    (role === 'All' || p.role === role) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.team.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* TopBar matching design */}
      <View style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl, gap: S.sm }}>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: C.text, letterSpacing: -0.3 }}>Players</Text>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 12, color: '#fff' }}>+ Register</Text>
          </Pressable>
        </View>
        {/* Search */}
        <View style={{ paddingHorizontal: S.xl, paddingBottom: S.sm, gap: S.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 10 }}>
            <Text style={{ fontSize: 16, color: C.textMuted }}>⌕</Text>
            <TextInput
              value={q} onChangeText={setQ}
              placeholder="Search players, teams..." placeholderTextColor={C.textMuted}
              style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.text }}
              autoCapitalize="none" autoCorrect={false}
            />
          </View>
          {/* Role filter tabs - underline style matching design */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border }}>
              {ROLES.map(r => (
                <Pressable key={r.id} onPress={() => setRole(r.id)}
                  style={{ paddingVertical: S.sm, paddingHorizontal: S.md, borderBottomWidth: 2, borderBottomColor: role === r.id ? C.primary : 'transparent', marginBottom: -1 }}>
                  <Text style={{ fontFamily: role === r.id ? F.bold : F.medium, fontSize: 13, color: role === r.id ? C.primaryLight : C.textSub, whiteSpace: 'nowrap' } as any}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 80, paddingTop: S.sm }}
        ListHeaderComponent={
          <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: S.sm, marginTop: S.xs }}>
            {filtered.length} Players
          </Text>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={{ fontSize: 36, marginBottom: S.md }}>👥</Text>
            <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.text }}>No players found</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: pressed ? C.cardHover : C.card,
              borderRadius: R.xl, borderWidth: 1, borderColor: C.border,
              padding: S.lg, marginBottom: S.sm,
              flexDirection: 'row', alignItems: 'center', gap: S.lg,
            })}>
            <Avatar name={item.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.text, marginBottom: 2 }}>{item.name}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.textMuted }}>{item.role} · {item.team}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.textMuted, marginTop: 2 }}>📍 {item.location}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.text }}>{item.stat}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textMuted }}>{item.label}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 10, color: C.textSub, marginTop: 2 }}>avg {item.avg}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
