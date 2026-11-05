-- CreateTable
CREATE TABLE "quran_datasets" (
    "riwaya" "Riwaya" NOT NULL,
    "version" INTEGER NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" DATE,
    "source" JSONB NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quran_datasets_pkey" PRIMARY KEY ("riwaya")
);
