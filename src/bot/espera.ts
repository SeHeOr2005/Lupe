/**
 * Estado de conversación por chat, en memoria y con vencimiento: lo que el bot
 * espera que la persona mande a continuación. Si el bot se reinicia se pierde,
 * y basta con volver a empezar la acción (o responder a la tarjeta).
 */
export class EstadoPorChat<T> {
  private readonly estados = new Map<number, { valor: T; hasta: number }>();

  constructor(
    private readonly vigenciaMs: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  poner(chatId: number, valor: T) {
    this.estados.set(chatId, { valor, hasta: this.ahora() + this.vigenciaMs });
  }

  /** El estado del chat, si aún está vigente. */
  leer(chatId: number): T | undefined {
    const e = this.estados.get(chatId);
    if (!e) return undefined;
    if (this.ahora() > e.hasta) {
      this.estados.delete(chatId);
      return undefined;
    }
    return e.valor;
  }

  quitar(chatId: number) {
    this.estados.delete(chatId);
  }
}

/**
 * Después de aprobar una convocatoria, el bot queda esperando su pliego en ese
 * chat. Si la persona manda el PDF sin "Responder" a ningún mensaje, se asocia a
 * la última convocatoria aprobada ahí, mientras no haya pasado demasiado tiempo.
 */
export class EsperaDeDocumentos {
  private readonly estado: EstadoPorChat<string>;

  constructor(vigenciaMs = 2 * 60 * 60 * 1000, ahora: () => number = Date.now) {
    this.estado = new EstadoPorChat(vigenciaMs, ahora); // 2 horas por defecto
  }

  /** El chat acaba de aprobar esta convocatoria: lo próximo que mande sin responder es para ella. */
  marcar(chatId: number, convocatoriaId: string) {
    this.estado.poner(chatId, convocatoriaId);
  }

  /** La convocatoria que el chat tiene pendiente de documentos, si aún está vigente. */
  para(chatId: number): string | undefined {
    return this.estado.leer(chatId);
  }
}
