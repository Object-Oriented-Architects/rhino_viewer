import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 className='font-bold mb-3'>3D Viewer</h1>
      <ul>
        <li>
          <Link href='/glasses'>Glasses</Link>
        </li>
        <li>
          <Link href='/ring'>Ring</Link>
        </li>
        <li>
          <Link href='/ring-plusplastic'>Ring PlusPlastic</Link>
        </li>
      </ul>
    </div>
  )
}
