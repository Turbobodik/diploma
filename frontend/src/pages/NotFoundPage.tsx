import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Not found');

  return (
    <div className="app-content">
      <EmptyState
        icon={<Compass size={22} />}
        title="Page not found"
        description="The workspace route you requested does not exist."
        action={
          <Link to="/projects" className="btn btn-primary">
            Return to projects
          </Link>
        }
      />
    </div>
  );
}
