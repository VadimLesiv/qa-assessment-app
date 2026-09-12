import { Link } from 'react-router-dom';
import { Empty } from '../components/States';

export function NotFoundPage() {
  return (
    <main className="page">
      <Empty icon="🧭" title="That page does not exist">
        <Link to="/" className="btn btn--primary btn--sm">
          Back to dashboard
        </Link>
      </Empty>
    </main>
  );
}
