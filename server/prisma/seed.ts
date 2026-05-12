import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env') })

const db = new PrismaClient()

const USERS = [
  {
    email: 'pharaoh@seed.dev',
    username: 'djpharaoh',
    name: 'DJ Pharaoh',
    image: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=pharaoh',
  },
  {
    email: 'viper@seed.dev',
    username: 'vinylviper',
    name: 'Vinyl Viper',
    image: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=viper',
  },
  {
    email: 'wizard@seed.dev',
    username: 'scratchwiz',
    name: 'Scratch Wizard',
    image: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=wizard',
  },
  {
    email: 'phantom@seed.dev',
    username: 'bassphantom',
    name: 'Bass Phantom',
    image: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=phantom',
  },
  {
    email: 'mcgee@seed.dev',
    username: 'decksmcgee',
    name: 'Decks McGee',
    image: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=mcgee',
  },
]

async function main() {
  // ── Users ─────────────────────────────────────────────────────────────────
  const users = await Promise.all(
    USERS.map((u) =>
      db.user.upsert({
        where: { email: u.email },
        update: { username: u.username, name: u.name, image: u.image },
        create: u,
      })
    )
  )
  const [pharaoh, viper, wizard, phantom, mcgee] = users
  console.log(`✓ ${users.length} users`)

  // ── Helper ────────────────────────────────────────────────────────────────
  async function upsertBattle(id: string, data: {
    title: string
    type: string
    description: string
    startDate: Date
    endDate: Date
  }) {
    return db.battle.upsert({
      where: { id },
      update: {},
      create: { id, ...data },
    })
  }

  // ── Battle 1: UPCOMING (May 20 – May 30) ─────────────────────────────────
  const upcomingBattle = await upsertBattle('seed-battle-upcoming', {
    title: 'Drum & Bass Duel',
    type: 'DNB',
    description: 'Drop your sickest D&B cuts. Liquid, neurofunk, jump-up — all sub-genres welcome.',
    startDate: new Date('2026-05-20'),
    endDate: new Date('2026-05-30'),
  })

  const [upSub1, upSub2] = await Promise.all([
    db.submission.upsert({
      where: { id: `seed-up-sub1` } as never,
      update: {},
      create: {
        id: 'seed-up-sub1',
        battleId: upcomingBattle.id,
        userId: pharaoh.id,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Pharaoh\'s Jungle Ritual',
        description: 'Liquid DNB set recorded live at the Pyramid.',
      },
    }),
    db.submission.upsert({
      where: { id: `seed-up-sub2` } as never,
      update: {},
      create: {
        id: 'seed-up-sub2',
        battleId: upcomingBattle.id,
        userId: viper.id,
        videoUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        title: 'Viper\'s Neurofunk Assault',
        description: 'Heavy neurofunk with custom 808 breaks.',
      },
    }),
  ])
  console.log(`✓ UPCOMING battle "${upcomingBattle.title}" — ${[upSub1, upSub2].length} submissions`)

  // ── Battle 2: ACTIVE (May 1 – May 15) ────────────────────────────────────
  const activeBattle = await upsertBattle('seed-battle-active', {
    title: 'Summer Scratch Sessions',
    type: 'Open Format',
    description: 'Show off your scratch technique. Any genre, any style. Let the cuts speak.',
    startDate: new Date('2026-05-01'),
    endDate: new Date('2026-05-15'),
  })

  const [actSub1, actSub2, actSub3] = await Promise.all([
    db.submission.upsert({
      where: { id: 'seed-act-sub1' } as never,
      update: {},
      create: {
        id: 'seed-act-sub1',
        battleId: activeBattle.id,
        userId: wizard.id,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Flare to Crab Combo',
        description: 'Back-to-back flare orbits into a crab run.',
      },
    }),
    db.submission.upsert({
      where: { id: 'seed-act-sub2' } as never,
      update: {},
      create: {
        id: 'seed-act-sub2',
        battleId: activeBattle.id,
        userId: phantom.id,
        videoUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        title: 'Bass-Drop Transforms',
        description: 'Heavy transformer scratches over a 140 BPM trap groove.',
      },
    }),
    db.submission.upsert({
      where: { id: 'seed-act-sub3' } as never,
      update: {},
      create: {
        id: 'seed-act-sub3',
        battleId: activeBattle.id,
        userId: mcgee.id,
        videoUrl: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
        title: 'McGee\'s Chirp Marathon',
        description: 'Non-stop chirp sequence — 3 minutes straight.',
      },
    }),
  ])

  // Votes: wizard leads with 3, phantom has 1, mcgee has 0
  await Promise.all([
    db.vote.upsert({
      where: { userId_battleId: { userId: pharaoh.id, battleId: activeBattle.id } },
      update: {},
      create: { id: 'seed-act-v1', submissionId: actSub1.id, battleId: activeBattle.id, userId: pharaoh.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: viper.id, battleId: activeBattle.id } },
      update: {},
      create: { id: 'seed-act-v2', submissionId: actSub1.id, battleId: activeBattle.id, userId: viper.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: mcgee.id, battleId: activeBattle.id } },
      update: {},
      create: { id: 'seed-act-v3', submissionId: actSub1.id, battleId: activeBattle.id, userId: mcgee.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: phantom.id, battleId: activeBattle.id } },
      update: {},
      create: { id: 'seed-act-v4', submissionId: actSub2.id, battleId: activeBattle.id, userId: phantom.id },
    }),
  ])
  console.log(`✓ ACTIVE battle "${activeBattle.title}" — 3 submissions, 4 votes`)

  // ── Battle 3: COMPLETED with clear winner (Apr 10 – Apr 20) ──────────────
  const completedBattle = await upsertBattle('seed-battle-completed', {
    title: 'OG Hip-Hop Faceoff',
    type: 'Hip-Hop',
    description: 'Classic hip-hop only. Boom bap beats, golden era samples, no trap.',
    startDate: new Date('2026-04-10'),
    endDate: new Date('2026-04-20'),
  })

  const [cmpSub1, cmpSub2, cmpSub3] = await Promise.all([
    db.submission.upsert({
      where: { id: 'seed-cmp-sub1' } as never,
      update: {},
      create: {
        id: 'seed-cmp-sub1',
        battleId: completedBattle.id,
        userId: viper.id,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Viper\'s Golden Tape',
        description: "Pure '93 flavour with a Primo-style sample chop.",
      },
    }),
    db.submission.upsert({
      where: { id: 'seed-cmp-sub2' } as never,
      update: {},
      create: {
        id: 'seed-cmp-sub2',
        battleId: completedBattle.id,
        userId: pharaoh.id,
        videoUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        title: 'Pharaoh\'s Boom Bap Opus',
        description: 'Multi-layer chops over a live drum break.',
      },
    }),
    db.submission.upsert({
      where: { id: 'seed-cmp-sub3' } as never,
      update: {},
      create: {
        id: 'seed-cmp-sub3',
        battleId: completedBattle.id,
        userId: wizard.id,
        videoUrl: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
        title: 'Scratch Wizard\'s Rewind',
        description: "Back-to-back rewind scratches on a classic '95 break.",
      },
    }),
  ])

  // Viper wins with 3 votes, Pharaoh gets 1, Wizard gets 0
  await Promise.all([
    db.vote.upsert({
      where: { userId_battleId: { userId: wizard.id, battleId: completedBattle.id } },
      update: {},
      create: { id: 'seed-cmp-v1', submissionId: cmpSub1.id, battleId: completedBattle.id, userId: wizard.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: phantom.id, battleId: completedBattle.id } },
      update: {},
      create: { id: 'seed-cmp-v2', submissionId: cmpSub1.id, battleId: completedBattle.id, userId: phantom.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: mcgee.id, battleId: completedBattle.id } },
      update: {},
      create: { id: 'seed-cmp-v3', submissionId: cmpSub1.id, battleId: completedBattle.id, userId: mcgee.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: viper.id, battleId: completedBattle.id } },
      update: {},
      create: { id: 'seed-cmp-v4', submissionId: cmpSub2.id, battleId: completedBattle.id, userId: viper.id },
    }),
  ])
  console.log(`✓ COMPLETED battle "${completedBattle.title}" — 3 submissions, clear winner (Vinyl Viper, 3 votes)`)

  // ── Battle 4: COMPLETED with a TIE (Apr 1 – Apr 5) ───────────────────────
  const tieBattle = await upsertBattle('seed-battle-tie', {
    title: 'Turntablist Throwdown',
    type: 'Turntablism',
    description: 'Pure turntablism — scratching, beat juggling, and needle drops only.',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-04-05'),
  })

  const [tieSub1, tieSub2] = await Promise.all([
    db.submission.upsert({
      where: { id: 'seed-tie-sub1' } as never,
      update: {},
      create: {
        id: 'seed-tie-sub1',
        battleId: tieBattle.id,
        userId: phantom.id,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Phantom\'s Beat Juggle',
        description: 'Complex juggle pattern switching between two copies of the same record.',
      },
    }),
    db.submission.upsert({
      where: { id: 'seed-tie-sub2' } as never,
      update: {},
      create: {
        id: 'seed-tie-sub2',
        battleId: tieBattle.id,
        userId: mcgee.id,
        videoUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        title: 'McGee\'s Needle Drop Showcase',
        description: 'Perfect drop accuracy on 12 different records.',
      },
    }),
  ])

  // Tie: each submission gets 2 votes
  await Promise.all([
    db.vote.upsert({
      where: { userId_battleId: { userId: pharaoh.id, battleId: tieBattle.id } },
      update: {},
      create: { id: 'seed-tie-v1', submissionId: tieSub1.id, battleId: tieBattle.id, userId: pharaoh.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: wizard.id, battleId: tieBattle.id } },
      update: {},
      create: { id: 'seed-tie-v2', submissionId: tieSub1.id, battleId: tieBattle.id, userId: wizard.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: viper.id, battleId: tieBattle.id } },
      update: {},
      create: { id: 'seed-tie-v3', submissionId: tieSub2.id, battleId: tieBattle.id, userId: viper.id },
    }),
    db.vote.upsert({
      where: { userId_battleId: { userId: phantom.id, battleId: tieBattle.id } },
      update: {},
      create: { id: 'seed-tie-v4', submissionId: tieSub2.id, battleId: tieBattle.id, userId: phantom.id },
    }),
  ])
  console.log(`✓ COMPLETED battle "${tieBattle.title}" — 2 submissions, TIE (2 votes each)`)

  console.log('\nSeed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
