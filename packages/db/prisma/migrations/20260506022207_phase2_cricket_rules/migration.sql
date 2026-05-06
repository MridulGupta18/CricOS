-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('GROUP', 'KNOCKOUT', 'FINAL');

-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'SUPER_OVER';

-- AlterTable
ALTER TABLE "BallEvent" ADD COLUMN     "isFreeHit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlayerCareerStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "battingMatches" INTEGER NOT NULL DEFAULT 0,
    "battingInnings" INTEGER NOT NULL DEFAULT 0,
    "battingRuns" INTEGER NOT NULL DEFAULT 0,
    "battingBalls" INTEGER NOT NULL DEFAULT 0,
    "battingHighScore" INTEGER NOT NULL DEFAULT 0,
    "battingFours" INTEGER NOT NULL DEFAULT 0,
    "battingSixes" INTEGER NOT NULL DEFAULT 0,
    "battingHalfCenturies" INTEGER NOT NULL DEFAULT 0,
    "battingCenturies" INTEGER NOT NULL DEFAULT 0,
    "battingNotOuts" INTEGER NOT NULL DEFAULT 0,
    "battingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "battingStrikeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bowlingMatches" INTEGER NOT NULL DEFAULT 0,
    "bowlingBallsDelivered" INTEGER NOT NULL DEFAULT 0,
    "bowlingRuns" INTEGER NOT NULL DEFAULT 0,
    "bowlingWickets" INTEGER NOT NULL DEFAULT 0,
    "bowlingMaidens" INTEGER NOT NULL DEFAULT 0,
    "bowlingBestFiguresWickets" INTEGER NOT NULL DEFAULT 0,
    "bowlingBestFiguresRuns" INTEGER NOT NULL DEFAULT 0,
    "bowlingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bowlingEconomy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bowlingStrikeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiveWicketHauls" INTEGER NOT NULL DEFAULT 0,
    "catches" INTEGER NOT NULL DEFAULT 0,
    "runOuts" INTEGER NOT NULL DEFAULT 0,
    "stumpings" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCareerStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentStage" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stageType" "StageType" NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "teamsAdvance" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentFixture" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "matchId" TEXT,
    "team1Id" TEXT,
    "team2Id" TEXT,
    "winnerId" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentFixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCareerStats_playerId_key" ON "PlayerCareerStats"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentFixture_matchId_key" ON "TournamentFixture"("matchId");

-- AddForeignKey
ALTER TABLE "PlayerCareerStats" ADD CONSTRAINT "PlayerCareerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStage" ADD CONSTRAINT "TournamentStage_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentFixture" ADD CONSTRAINT "TournamentFixture_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentFixture" ADD CONSTRAINT "TournamentFixture_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;
