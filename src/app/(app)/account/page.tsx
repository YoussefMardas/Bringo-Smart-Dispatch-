import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "@/components/password-form";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={ROLE_LABELS[user.role]} title="Mon compte" description={user.email} />
      <PasswordForm />
    </div>
  );
}
