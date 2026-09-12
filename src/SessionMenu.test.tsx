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
