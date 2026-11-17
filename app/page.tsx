import { getAllPages, getRepoInfo, hasWikiSource } from "@/lib/wiki";
import BrainApp from "@/components/app/BrainApp";

export const revalidate = 300;

export default async function Home() {
  const pages = await getAllPages();
  return <BrainApp pages={pages} repo={getRepoInfo()} usingSample={!hasWikiSource()} writable={hasWikiSource() && !!process.env.WIKI_WRITE_KEY} />;
}
