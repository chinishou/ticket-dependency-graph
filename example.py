import shotgun_api3
import os
from dotenv import load_dotenv
load_dotenv()


cloud_sg = shotgun_api3.Shotgun(
    os.getenv("SG_URL"),
    script_name=os.getenv("SCRIPT_NAME"),
    api_key=os.getenv("API_KEY"),
)