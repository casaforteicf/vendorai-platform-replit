import React from "react";
import { notifications } from "./operationsData";
import { formatDate, notificationClass } from "./operationsUtils";

export function NotificationCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Notification Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Alertas do sistema</h2>

      <div className="mt-5 space-y-3">
        {notifications.map((notification) => (
          <article key={notification.id} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                <p className="mt-1 text-xs text-slate-500">{notification.module} • {formatDate(notification.date)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${notificationClass(notification.type)}`}>{notification.type}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{notification.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
