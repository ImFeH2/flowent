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
  it("renders shared controls and closes on Escape", () => {
    render(
      <ImageViewerProvider>
        <Harness />
      </ImageViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));

    expect(screen.getByRole("button", { name: "Zoom In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom Out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("button", { name: "Zoom In" }),
    ).not.toBeInTheDocument();
  });

  it("supports zoom controls and drag panning when enlarged", () => {
    render(
      <ImageViewerProvider>
        <Harness />
      </ImageViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));

    const image = screen.getByTestId("global-image-viewer-image");
    const stage = screen.getByTestId("global-image-viewer-stage");

    expect(image).toHaveStyle({ transform: "scale(1.25)" });
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();

    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 155 });
    fireEvent.mouseUp(window);

    expect(stage).toHaveStyle({
      transform: "translate3d(40px, 55px, 0px)",
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(image).toHaveStyle({ transform: "scale(1)" });
    expect(stage).toHaveStyle({ transform: "translate3d(0px, 0px, 0px)" });
  });

  it("closes on backdrop click without treating image content as backdrop", () => {
    render(
      <ImageViewerProvider>
        <Harness />
      </ImageViewerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
    fireEvent.click(screen.getByTestId("global-image-viewer-image"));

    expect(screen.getByRole("button", { name: "Zoom In" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("global-image-viewer-backdrop"));

    expect(
      screen.queryByRole("button", { name: "Zoom In" }),
    ).not.toBeInTheDocument();
  });
});
