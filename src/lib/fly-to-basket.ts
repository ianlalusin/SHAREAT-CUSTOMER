/**
 * "Add to order" parks a line in a basket; nothing reaches the kitchen until
 * "Send to kitchen". Diners read the red Add button as "sent" because the only
 * hint that anything was parked is a bar below the menu. So: the item visibly
 * flies from the Add button into whichever basket button is on screen, and the
 * basket bumps when it lands.
 *
 * Basket buttons opt in with `data-basket-target`. No React state: one
 * throwaway element on <body>, animated with the Web Animations API.
 */
export function flyToBasket(origin: DOMRect, imageUrl?: string | null) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  // Two frames: on the first add, the basket button mounts in the same render
  // as the cart update and is not in the DOM yet when this is called.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-basket-target]"));
      const inView = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      };
      const target = targets.find(inView) ?? targets[0];
      if (!target) return;

      const t = target.getBoundingClientRect();
      const size = 44;
      const startX = origin.left + origin.width / 2;
      const startY = origin.top + origin.height / 2;
      const dx = t.left + t.width / 2 - startX;
      const dy = t.top + t.height / 2 - startY;

      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed",
        left: `${startX - size / 2}px`,
        top: `${startY - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "9999px",
        zIndex: "9999",
        pointerEvents: "none",
        background: "#fff",
        border: `2px solid ${getComputedStyle(target).backgroundColor || "#dc2626"}`,
        boxShadow: "0 8px 24px rgba(0,0,0,.28)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "22px",
        lineHeight: "1",
        willChange: "transform, opacity",
      } as CSSStyleDeclaration);

      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = "";
        Object.assign(img.style, { width: "100%", height: "100%", objectFit: "contain" } as CSSStyleDeclaration);
        el.appendChild(img);
      } else {
        el.textContent = "🛍️";
      }
      document.body.appendChild(el);

      // Lift first, then drop into the basket, so it reads as a toss rather
      // than a slide even when the basket is straight below the button.
      const anim = el.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 90}px) scale(0.95)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.22)`, opacity: 0.35, offset: 1 },
        ],
        { duration: 700, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
      );

      // Three ways out, all idempotent. `onfinish` alone was observed not to
      // fire (animation "finished", element still on the page), and a stuck
      // 44px circle over the menu is worse than no animation at all.
      let cleaned = false;
      const remove = () => {
        if (cleaned) return;
        cleaned = true;
        el.remove();
      };
      const done = () => {
        if (cleaned) return;
        remove();
        if (target.isConnected) {
          target.animate(
            [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
            { duration: 320, easing: "ease-out" }
          );
        }
      };
      anim.finished.then(done, remove);
      anim.onfinish = done;
      anim.oncancel = remove;
      window.setTimeout(done, 900);
    })
  );
}
