from openai import AzureOpenAI
import traceback

client = AzureOpenAI(
    api_key="mykey",
    api_version="2024-12-01-preview",
    azure_endpoint="https://smartdemand.openai.azure.com/"
)

try:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": "hello"
            }
        ]
    )

    print("\nSUCCESS:")
    print(response.choices[0].message.content)

except Exception as e:
    print("\nFULL ERROR:")
    traceback.print_exc()