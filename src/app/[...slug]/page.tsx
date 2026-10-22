import { Application } from '@/components/application';
export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <Application path={'/' + slug.join('/')} />;
}
