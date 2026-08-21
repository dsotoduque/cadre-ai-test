import { listLeads } from "@/modules/users/application/list-leads";
import { LogoutButton } from "@/app/admin/logout-button";

// Without this, Next.js has no dynamic API call to detect and prerenders this page once at
// build time — the leads list would freeze at that snapshot instead of reflecting new leads.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const leads = await listLeads();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <LogoutButton />
      </div>

      {leads.length === 0 ? (
        <p className="text-gray-500">No leads yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Question</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b align-top">
                <td className="py-2 pr-4">{lead.question}</td>
                <td className="py-2 pr-4">{lead.email ?? "—"}</td>
                <td className="py-2 pr-4">{lead.status}</td>
                <td className="py-2 pr-4">{new Date(lead.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
