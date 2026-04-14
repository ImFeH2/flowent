import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageViewerProvider } from "@/components/ImageViewer";
import { useImageViewer } from "@/context/imageViewer";

afterEach(() => {
  cleanup();
});

function Harness() {
  const { openImage } = useImageViewer();

  return (
    <button
      onClick={() =>
        openImage({
          src: "https://example.com/preview.png",
          alt: "Viewer image",
          meta: "image/png · 640x480",
        })
      }
      type="button"
    >
      Open preview
    </button>
  );
}

describe("ImageViewer", () => {
  it("uses gesture-first zooming and closes on Escape", () => {
    render(
      <ImageViewerProvider>
        <Harness />
      </ImageViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));

    expect(
      screen.getAllByRole("button", { name: "Close image preview" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Zoom In" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Zoom Out" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryAllByRole("button", { name: "Close image preview" }),
    ).toHaveLength(0);
  });

  it("zooms around the cursor and supports drag panning when enlarged", () => {
    render(
      <ImageViewerProvider>
        <Harness />
      </ImageViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));

    const image = screen.getByTestId("global-image-viewer-image");
    const stage = screen.getByTestId("global-image-viewer-stage");
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.wheel(stage, {
      deltaY: -100,
      clientX: 280,
      clientY: 190,
    });

    expect(image).toHaveStyle({ transform: "scale(1.25)" });
    expect(stage).toHaveStyle({
      transform: "translate3d(-20px, -10px, 0px)",
    });

    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 155 });
    fireEvent.mouseUp(window);

    expect(stage).toHaveStyle({
      transform: "translate3d(20px, 45px, 0px)",
    });

    fireEvent.wheel(stage, {
      deltaY: 100,
      clientX: 280,
      clientY: 190,
    });

    expect(image).toHaveStyle({ transform: "scale(1)" });
    expect(stage).toHaveStyle({ transform: "translate3d(0px, 0px, 0px)" });
  });

  it("closes on backdrop click without treating image content or drags as backdrop", () => {
    render(
      <ImageViewerProvider>
        <Harness />
      </ImageViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
    const stage = screen.getByTestId("global-image-viewer-stage");
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(screen.getByTestId("global-image-viewer-image"));
    fireEvent.wheel(stage, {
      deltaY: -100,
      clientX: 260,
      clientY: 170,
    });
    fireEvent.mouseDown(stage, { button: 0, clientX: 120, clientY: 120 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 145 });
    fireEvent.mouseUp(window);

    expect(
      screen.getAllByRole("button", { name: "Close image preview" }),
    ).toHaveLength(2);

    fireEvent.click(screen.getByTestId("global-image-viewer-backdrop"));

    expect(
      screen.queryAllByRole("button", { name: "Close image preview" }),
    ).toHaveLength(0);
  });
});
