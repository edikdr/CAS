#!/usr/bin/env bash
# ============================================================================
# HAOTICA OS / UBUNTU — УСТАНОВКА ИНТЕЛЛЕКТУАЛЬНОГО АГЕНТА GEMINI В ТЕРМИНАЛ
# Владелец: Eduard (Едуард) · Lenovo Legion (AMD Radeon 8060S)
# ============================================================================
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
AMB='\033[0;33m'
CYN='\033[0;36m'
RST='\033[0m'

echo -e "${CYN}======================================================================${RST}"
echo -e "${CYN}   HAOTICA AI · УСТАНОВКА АГЕНТА GEMINI ДЛЯ ТЕРМИНАЛА UBUNTU         ${RST}"
echo -e "${CYN}======================================================================${RST}"

# 1. Запрос API ключа, если он еще не передан в окружении
KEY_FILE="$HOME/.config/gemini/api_key"
mkdir -p "$(dirname "$KEY_FILE")" "$HOME/.local/bin"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  if [[ -f "$KEY_FILE" ]] && [[ -s "$KEY_FILE" ]]; then
    GEMINI_API_KEY="$(cat "$KEY_FILE" | tr -d '[:space:]')"
  else
    echo -e "${AMB}Вставь скопированный Gemini API Key (нажми Enter):${RST}"
    read -r -s input_key
    echo ""
    if [[ -z "$input_key" ]]; then
      echo -e "${RED}Ошибка: ключ не введён. Получить ключ: https://aistudio.google.com/apikey${RST}"
      exit 1
    fi
    GEMINI_API_KEY="$(echo "$input_key" | tr -d '[:space:]')"
  fi
fi

echo "$GEMINI_API_KEY" > "$KEY_FILE"
chmod 0600 "$KEY_FILE"

# Сохраняем в ~/.bashrc и ~/.zshrc для автозагрузки
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [[ -f "$rc" ]]; then
    sed -i '/GEMINI_API_KEY/d' "$rc" 2>/dev/null || true
    echo "export GEMINI_API_KEY=\"$GEMINI_API_KEY\"" >> "$rc"
  fi
done

# 2. Изолированное Python-окружение для Google GenAI SDK
ENV_DIR="$HOME/.local/share/gemini-cli/venv"
echo -e "${CYN}[1/3] Подготовка окружения Python (Google GenAI SDK)…${RST}"
if [[ ! -x "$ENV_DIR/bin/python3" ]]; then
  mkdir -p "$(dirname "$ENV_DIR")"
  python3 -m venv "$ENV_DIR"
fi

"$ENV_DIR/bin/pip" install -q --upgrade pip
"$ENV_DIR/bin/pip" install -q google-genai psutil

# 3. Создание агента gemini
echo -e "${CYN}[2/3] Создание исполняемого файла агента ~/.local/bin/gemini…${RST}"
cat << 'EOF' > "$HOME/.local/bin/gemini"
#!/usr/bin/env bash
ENV_DIR="$HOME/.local/share/gemini-cli/venv"
KEY_FILE="$HOME/.config/gemini/api_key"

if [[ -z "${GEMINI_API_KEY:-}" && -f "$KEY_FILE" ]]; then
  export GEMINI_API_KEY="$(cat "$KEY_FILE" | tr -d '[:space:]')"
fi

exec "$ENV_DIR/bin/python3" - << 'PYEOF' "$@"
import os
import sys
import subprocess
from datetime import datetime
from google import genai
from google.genai import types

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    key_file = os.path.expanduser("~/.config/gemini/api_key")
    if os.path.exists(key_file):
        with open(key_file, "r") as f:
            api_key = f.read().strip()

if not api_key:
    print("\033[1;31m[Ошибка]\033[0m GEMINI_API_KEY не найден. Получите на https://aistudio.google.com/apikey")
    sys.exit(1)

client = genai.Client(api_key=api_key)

# Системные инструменты агента для управления ноутбуком и рабочим столом
def run_command(command: str) -> str:
    """Выполняет bash-команду в системе Linux (Ubuntu) на ноутбуке Lenovo Legion и возвращает вывод."""
    print(f"\033[1;33m  ⚡ [EXEC]\033[0m \033[0;36m{command}\033[0m")
    try:
        res = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=120)
        out = (res.stdout + res.stderr).strip()
        if res.returncode != 0:
            return f"(exit {res.returncode})\n{out}"
        return out if out else "(Успешно выполнено, код 0)"
    except Exception as e:
        return f"Ошибка выполнения: {e}"

def read_file(path: str) -> str:
    """Читает содержимое файла на компьютере."""
    try:
        p = os.path.expanduser(path)
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            return f.read(16000)
    except Exception as e:
        return f"Ошибка чтения {path}: {e}"

def write_file(path: str, content: str) -> str:
    """Записывает или создает файл на компьютере."""
    try:
        p = os.path.expanduser(path)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Файл {path} успешно сохранён."
    except Exception as e:
        return f"Ошибка записи в {path}: {e}"

model_name = "gemini-2.5-flash"
args = sys.argv[1:]
if args and args[0] in ("--pro", "-p"):
    model_name = "gemini-2.5-pro"
    args = args[1:]

sys_prompt = (
    "Ты — личный ИИ-ассистент в терминале Ubuntu на ноутбуке Lenovo Legion 7 (AMD Ryzen AI Max+ 392, Radeon 8060S). "
    "Владелец: Eduard (Едуард). Немецкая клавиатура ISO-DE QWERTZ. "
    "У тебя есть полный доступ к инструментам run_command, read_file, write_file для управления системой, "
    "настройки рабочего стола (GNOME, gsettings, темы, обои, виджеты, конфиги, пакеты apt/pip, службы systemd). "
    "Всегда применяй действия напрямую через свои инструменты, чтобы решать задачи Эдуарда, "
    "и отвечай кратко, чётко и вежливо по-русски."
)

chat = client.chats.create(
    model=model_name,
    config=types.GenerateContentConfig(
        system_instruction=sys_prompt,
        tools=[run_command, read_file, write_file],
        temperature=0.3,
    ),
)

if args:
    query = " ".join(args)
    resp = chat.send_message(query)
    if resp.text:
        print(f"\n\033[1;32mHaotica AI:\033[0m {resp.text.strip()}\n")
    sys.exit(0)

# Интерактивный режим чата
print("\033[1;36m==============================================================\033[0m")
print(f"\033[1;32m  HAOTICA AI TERMINAL\033[0m  ·  Модель: \033[1;33m{model_name}\033[0m  (Eduard / Legion 7)")
print("  Команды: 'exit' или Ctrl+D для выхода, 'clear' для очистки")
print("\033[1;36m==============================================================\033[0m\n")

while True:
    try:
        user_input = input("\033[1;32mEduard ❯\033[0m ").strip()
        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            print("До свидания, Едуард!")
            break
        if user_input.lower() == "clear":
            os.system("clear")
            continue

        resp = chat.send_message(user_input)
        if resp.text:
            print(f"\n\033[1;32mHaotica AI:\033[0m {resp.text.strip()}\n")
    except (KeyboardInterrupt, EOFError):
        print("\nСессия завершена.")
        break
    except Exception as e:
        print(f"\n\033[1;31m[Ошибка]:\033[0m {e}\n")
PYEOF
EOF

chmod 0755 "$HOME/.local/bin/gemini"

# Добавляем ~/.local/bin в PATH если нет
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [[ -f "$rc" ]] && echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
  done
  export PATH="$HOME/.local/bin:$PATH"
fi

# Если есть sudo, сделаем симлинк в /usr/local/bin для всех сессий
if sudo -n true 2>/dev/null || command -v sudo >/dev/null 2>&1; then
  sudo ln -sf "$HOME/.local/bin/gemini" /usr/local/bin/gemini 2>/dev/null || true
fi

echo -e "${GRN}[3/3] Готово! Команда gemini установлена.${RST}"
echo ""
echo -e "${GRN}======================================================================${RST}"
echo -e "  Запуск интерактивного чата:   ${CYN}gemini${RST}"
echo -e "  Выполнение задачи одной строкой:  ${CYN}gemini \"сделай темную тему\"${RST}"
echo -e "  Использование модели Pro:     ${CYN}gemini --pro \"проанализируй систему\"${RST}"
echo -e "${GRN}======================================================================${RST}"
