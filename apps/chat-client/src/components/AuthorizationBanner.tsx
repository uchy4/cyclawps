import type { PendingAuth } from '../hooks/useMessages.js';

interface AuthorizationBannerProps {
  auth: PendingAuth;
  onAuthorize: (taskId: string, stageId: string, approved: boolean) => void;
}

export function AuthorizationBanner({ auth, onAuthorize }: AuthorizationBannerProps) {
  return (
    <div className="px-6 py-3 bg-stone-900 border-b border-yellow-500 flex items-center gap-3">
      <span className="text-lg">&#9888;</span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-yellow-500">Pipeline Authorization Required</div>
        <div className="text-[13px] text-slate-400">{auth.description}</div>
      </div>
      <button
        onClick={() => onAuthorize(auth.taskId, auth.stageId, true)}
        className="px-4 py-1.5 rounded-md border-none bg-orange-600 text-white cursor-pointer text-[13px]"
      >
        Approve
      </button>
      <button
        onClick={() => onAuthorize(auth.taskId, auth.stageId, false)}
        className="px-4 py-1.5 rounded-md border border-red-400 bg-transparent text-red-400 cursor-pointer text-[13px]"
      >
        Deny
      </button>
    </div>
  );
}
