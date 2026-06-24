import os
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
from dotenv import load_dotenv

# Load env variables from root directory .env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

def main():
    print("=" * 60)
    print(" CÔNG CỤ TẠO CHUỖI PHIÊN ĐĂNG NHẬP (TELEGRAM SESSION STRING)")
    print("=" * 60)

    api_id_raw = os.getenv('TELEGRAM_API_ID')
    api_hash = os.getenv('TELEGRAM_API_HASH')

    if not api_id_raw:
        api_id_raw = input("Nhập TELEGRAM_API_ID: ").strip()
    else:
        print(f"Sử dụng TELEGRAM_API_ID từ file .env: {api_id_raw}")

    if not api_hash:
        api_hash = input("Nhập TELEGRAM_API_HASH: ").strip()
    else:
        print(f"Sử dụng TELEGRAM_API_HASH từ file .env: ***")

    if not api_id_raw or not api_hash:
        print("Lỗi: Bạn phải cung cấp đầy đủ API_ID và API_HASH để tiếp tục.")
        return

    try:
        api_id = int(api_id_raw)
    except ValueError:
        print("Lỗi: API_ID phải là một số nguyên.")
        return

    print("\nĐang khởi tạo kết nối đến Telegram và yêu cầu xác thực...")
    # Initialize client with StringSession to generate a portable string session
    session = StringSession()
    client = TelegramClient(session, api_id, api_hash)

    try:
        # start() automatically prompts for phone, code, 2FA password in terminal
        client.start()
        
        session_str = client.session.save()
        print("\n" + "=" * 60)
        print(" ĐĂNG NHẬP THÀNH CÔNG!")
        print("=" * 60)
        print("\nHãy sao chép chuỗi mã hóa SESSION dưới đây:\n")
        print(session_str)
        print("\nDán dòng sau vào file .env ở thư mục gốc của bạn:\n")
        print(f'TELEGRAM_SESSION="{session_str}"')
        print("=" * 60 + "\n")
        
    except Exception as e:
        print(f"\nLỗi khi xác thực đăng nhập: {e}")
    finally:
        if client.is_connected():
            client.disconnect()

if __name__ == '__main__':
    main()
