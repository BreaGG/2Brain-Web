import { getAllPages, getRepoInfo, hasWikiSource } from "@/lib/wiki";
import BrainApp from "@/components/app/BrainApp";

export const revalidate = 60;

export default async function Home() {
  const pages = await getAllPages();
  return <BrainApp pages={pages} repo={getRepoInfo()} usingSample={!hasWikiSource()} writable={hasWikiSource()} askable={hasWikiSource() && !!process.env.ANTHROPIC_API_KEY} />;
}
