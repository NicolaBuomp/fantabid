import { Server, Socket } from "socket.io";
import { AuthUser, verifySupabaseJwt } from "../lib/jwt";

type TokenRefreshPayload = {
  token?: string;
};

type TokenRefreshAck = (response: {
  ok: boolean;
  error?: "MISSING_TOKEN" | "INVALID_TOKEN";
}) => void;

// Estendiamo l'interfaccia di Socket.io per includere i dati del nostro utente
interface AuthenticatedSocket extends Socket {
  data: {
    user: AuthUser;
  };
}

// --- STATO DELL'ASTA IN MEMORIA ---
// Mappa globale per tenere traccia dello stato di ogni lega attiva.
const activeRooms = new Map<string, any>();

export function registerAuctionSocket(io: Server) {
  const auctionNamespace = io.of("/auction");

  // ==========================================
  // MIDDLEWARE DI AUTENTICAZIONE
  // ==========================================
  auctionNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string" || !token) {
      return next(new Error("MISSING_TOKEN"));
    }

    try {
      socket.data.user = verifySupabaseJwt(token);
      return next();
    } catch {
      return next(new Error("INVALID_TOKEN"));
    }
  });

  // ==========================================
  // GESTIONE CONNESSIONI ED EVENTI
  // ==========================================
  auctionNamespace.on("connection", (socket: AuthenticatedSocket) => {
    const user = socket.data.user;
    console.log(`🔌 Utente connesso al namespace /auction: ${user.id}`);

    // 1. Refresh del Token
    socket.on(
      "token_refresh",
      (payload: TokenRefreshPayload, ack?: TokenRefreshAck) => {
        if (!payload?.token) {
          ack?.({ ok: false, error: "MISSING_TOKEN" });
          return;
        }

        try {
          socket.data.user = verifySupabaseJwt(payload.token);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "INVALID_TOKEN" });
          socket.emit("auth_error", { error: "INVALID_TOKEN" });
        }
      }
    );

    // 2. Ingresso nella Stanza dell'Asta (Join Room)
    socket.on("join_room", (data: { leagueId: string }) => {
      if (!data?.leagueId) return;

      const roomName = `league_${data.leagueId}`;
      socket.join(roomName);
      console.log(`👤 Utente ${user.id} entrato nella stanza ${roomName}`);

      // Inizializza lo stato in memoria se è il primo a entrare
      if (!activeRooms.has(roomName)) {
        activeRooms.set(roomName, {
          status: "IDLE",
          currentPlayer: null,
          currentBid: 0,
          highestBidderId: null,
          timerEndsAt: null,
          isPaused: false
        });
      }

      // Invia lo stato iniziale al client
      socket.emit("auction_state", activeRooms.get(roomName));
      socket.emit("server_time", { time: Date.now() });
    });

    // 3. Admin: Fa partire l'asta per un giocatore
    socket.on("admin_start_player", (data: { playerId: number, leagueId: string }) => {
      const roomName = `league_${data.leagueId}`;
      const room = activeRooms.get(roomName);

      if (room && room.status === "IDLE") {
        // MOCK: Fingiamo di recuperare il giocatore dal DB
        const playerMock = {
          id: data.playerId,
          name: "Lautaro Martinez",
          role: "A",
          team: "Inter"
        };

        // Aggiorna lo stato della stanza
        room.status = "ACTIVE";
        room.currentPlayer = playerMock;
        room.currentBid = 1; // Prezzo di base
        room.highestBidderId = null;
        room.timerEndsAt = Date.now() + 15000; // Es: timer a 15 secondi da ora

        // BROADCAST: Sveglia tutti i client nella stanza
        auctionNamespace.to(roomName).emit("new_player_on_auction", room);
      }
    });

    // 4. Utente (o Admin): Piazza un'offerta
    socket.on("place_bid", (data: { amount: number, leagueId: string }) => {
      const roomName = `league_${data.leagueId}`;
      const room = activeRooms.get(roomName);

      if (!room) return;

      // --- INIZIO CONTROLLI (Il Giudice) ---

      // Controllo 1: L'asta è aperta?
      if (room.status !== "ACTIVE") {
        socket.emit("bid_error", { message: "Asta chiusa o in pausa." });
        return;
      }

      // Controllo 2: L'offerta è superiore a quella attuale?
      if (data.amount <= room.currentBid) {
        socket.emit("bid_error", { message: "L'offerta deve superare il prezzo attuale." });
        return;
      }

      // Controllo 3: L'utente ha abbastanza crediti?
      // MOCK: Per ora fingiamo che ogni utente abbia 500 crediti fissi.
      // In futuro lo leggeremo dal DB o da una cache degli utenti.
      const currentBudget = 500;

      if (data.amount > currentBudget) {
        socket.emit("bid_error", { message: "Crediti insufficienti." });
        return;
      }

      // --- I CONTROLLI SONO PASSATI ---

      // Aggiorna lo stato con la nuova offerta vincente
      room.currentBid = data.amount;
      room.highestBidderId = user.id;

      // Prolunga il timer (es: aggiunge 5 secondi, ma senza superare un massimo)
      room.timerEndsAt = Date.now() + 5000;

      // BROADCAST: Avvisa tutti del nuovo prezzo
      auctionNamespace.to(roomName).emit("bid_update", {
        amount: room.currentBid,
        highestBidderId: room.highestBidderId,
        timerEndsAt: room.timerEndsAt
      });
    });

    // 5. Disconnessione
    socket.on("disconnect", () => {
      console.log(`❌ Utente disconnesso: ${user.id}`);
    });
  });
}
