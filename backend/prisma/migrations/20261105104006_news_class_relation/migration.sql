-- AddForeignKey
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
