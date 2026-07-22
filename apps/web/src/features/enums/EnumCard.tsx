import { useState } from "react";
import type { ResolvedEnumBookmark } from "@cr/contracts";

type Props = {
  item: ResolvedEnumBookmark;
  deleting: boolean;
  onDelete: (id: string) => void;
  onRelink: (item: ResolvedEnumBookmark) => void;
};

export function EnumCard({ item, deleting, onDelete, onRelink }: Props) {
  const [confirming, setConfirming] = useState(false);
  const language = item.language === "python" ? "Python" : "TypeScript";

  return (
    <article className={`enum-card enum-${item.state}`}>
      <header>
        <div>
          <h3>{item.symbolName}</h3>
          <p>{language} · {item.relativePath}</p>
        </div>
      </header>

      {item.state === "ready" ? (
        <dl>
          {item.members.map((member) => (
            <div className="enum-member" key={member.name}>
              <dt>{member.name}</dt>
              <dd>
                <code>{member.value}</code>
                {member.comment ? <span>{member.comment}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="enum-warning" role="alert">
          {item.message || "保存位置中的枚举已失效。"}
        </p>
      )}

      <div className="enum-actions">
        {item.state !== "ready" ? (
          <button
            type="button"
            aria-label={`重新定位 ${item.symbolName}`}
            onClick={() => onRelink(item)}
          >
            重新定位
          </button>
        ) : null}
        {!confirming ? (
          <button
            type="button"
            aria-label={`删除 ${item.symbolName}`}
            onClick={() => setConfirming(true)}
          >
            删除
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setConfirming(false)}>
              取消删除
            </button>
            <button
              type="button"
              className="danger-action"
              disabled={deleting}
              onClick={() => onDelete(item.id)}
            >
              确认删除
            </button>
          </>
        )}
      </div>
    </article>
  );
}
