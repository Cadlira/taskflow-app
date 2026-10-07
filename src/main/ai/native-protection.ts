import { safeStorage } from 'electron'

/**
 * Proteção nativa da credencial. A interface é estrutural para que o store e os testes não
 * dependam do Electron; a implementação de produção usa `safeStorage` (DPAPI no Windows) e vive
 * somente no main.
 */
export interface AiNativeProtection {
  /** Verdadeiro quando o mecanismo nativo está disponível para cifrar e decifrar. */
  available(): boolean
  /** Cifra a credencial em texto claro; o retorno nunca é gravado fora do envelope. */
  encrypt(text: string): Buffer
  /** Decifra o ciphertext; lança quando o blob não pertence a este perfil. */
  decrypt(data: Buffer): string
}

/**
 * Adaptador de produção. `isEncryptionAvailable` é conferido a cada uso: no Windows ele depende do
 * estado do DPAPI do usuário, que pode mudar durante a execução. Nenhum caminho degrada para texto
 * simples quando o mecanismo está indisponível — o chamador bloqueia.
 */
export function createNativeProtection(): AiNativeProtection {
  return {
    available: () => {
      try {
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    },
    encrypt: (text: string) => safeStorage.encryptString(text),
    decrypt: (data: Buffer) => safeStorage.decryptString(data),
  }
}
