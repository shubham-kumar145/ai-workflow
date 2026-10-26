-- CreateTable
CREATE TABLE "workspace_snapshots" (
    "projectId" TEXT NOT NULL,
    "archive" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_snapshots_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
