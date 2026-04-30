import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AISidebar } from "@/components/AISidebar";

const mockOnMutation = vi.fn();
const mockOnClose = vi.fn();

vi.mock("@/lib/api", () => ({
  apiChat: vi.fn(),
}));

import { apiChat } from "@/lib/api";

function renderSidebar() {
  return render(<AISidebar onMutation={mockOnMutation} onClose={mockOnClose} />);
}

describe("AISidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state prompt", () => {
    renderSidebar();
    expect(screen.getByText(/ask me to add/i)).toBeInTheDocument();
  });

  it("calls onClose when Close is clicked", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /close ai sidebar/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows user message immediately after submit", async () => {
    vi.mocked(apiChat).mockResolvedValue({ message: "Sure!" });
    renderSidebar();
    await userEvent.type(screen.getByLabelText(/ai message input/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows loading indicator while waiting", async () => {
    vi.mocked(apiChat).mockReturnValue(new Promise(() => {}));
    renderSidebar();
    await userEvent.type(screen.getByLabelText(/ai message input/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByLabelText(/ai is thinking/i)).toBeInTheDocument();
  });

  it("shows assistant reply after response", async () => {
    vi.mocked(apiChat).mockResolvedValue({ message: "The answer is 4." });
    renderSidebar();
    await userEvent.type(screen.getByLabelText(/ai message input/i), "What is 2+2?");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText("The answer is 4.")).toBeInTheDocument();
  });

  it("calls onMutation when AI returns new cards", async () => {
    const newCard = { id: "card-x", column_id: "col-backlog", title: "X", details: "" };
    vi.mocked(apiChat).mockResolvedValue({ message: "Added!", new_cards: [newCard] });
    renderSidebar();
    await userEvent.type(screen.getByLabelText(/ai message input/i), "Add a card");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(mockOnMutation).toHaveBeenCalledWith(expect.objectContaining({ new_cards: [newCard] })));
  });

  it("submits on Enter key", async () => {
    vi.mocked(apiChat).mockResolvedValue({ message: "Hello!" });
    renderSidebar();
    await userEvent.type(screen.getByLabelText(/ai message input/i), "Hi{Enter}");
    expect(await screen.findByText("Hello!")).toBeInTheDocument();
  });

  it("shows error message on API failure", async () => {
    vi.mocked(apiChat).mockRejectedValue(new Error("Network error"));
    renderSidebar();
    await userEvent.type(screen.getByLabelText(/ai message input/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText(/failed to reach ai/i)).toBeInTheDocument();
  });
});
