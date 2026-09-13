import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "./lib/locale-context";
import { GroupMenu, ProjectMenu } from "./SessionMenu";

describe("ProjectMenu", () => {
  it("lists existing groups and lets a project leave its group", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(ProjectMenu, {
          top: 0,
          left: 0,
          pinned: false,
          groups: [{ id: "g-work", name: "工作" }],
          currentGroupId: "g-work",
          onPin: () => {},
          onMoveToGroup: () => {},
          onUngroup: () => {},
          onCreateGroup: () => {},
        }),
      }),
    );
    expect(html).toContain("移到「工作」");
    expect(html).toContain("新建分组");
    expect(html).toContain("移出分组");
    expect(html).toContain("disabled");
  });

  it("offers new session, reveal, copy path, and remove-from-list", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(ProjectMenu, {
          top: 0,
          left: 0,
          pinned: false,
          onPin: () => {},
          onNewSession: () => {},
          onReveal: () => {},
          onCopyPath: () => {},
          onRemove: () => {},
        }),
      }),
    );
    expect(html).toContain("在此项目新开会话");
    expect(html).toContain("在访达中显示");
    expect(html).toContain("复制项目路径");
    expect(html).toContain("从列表移除项目");
    expect(html).toContain("danger");
  });

  it("hides optional rows when their handlers are absent", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(ProjectMenu, {
          top: 0,
          left: 0,
          pinned: false,
          onPin: () => {},
        }),
      }),
    );
    expect(html).not.toContain("在此项目新开会话");
    expect(html).not.toContain("从列表移除项目");
  });
});

describe("GroupMenu", () => {
  it("offers rename and delete", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "zh",
        children: createElement(GroupMenu, {
          top: 0,
          left: 0,
          onRename: () => {},
          onDelete: () => {},
        }),
      }),
    );
    expect(html).toContain("重命名");
    expect(html).toContain("删除分组");
    expect(html).toContain("danger");
  });
});
