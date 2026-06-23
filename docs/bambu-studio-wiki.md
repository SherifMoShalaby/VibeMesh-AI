# Bambu Studio — Bambu Lab Wiki

> Full-text extraction of the **Bambu Studio** documentation from the Bambu Lab Wiki.
> Source hub: <https://wiki.bambulab.com/en/studio-handy>
> Extracted: 2026-06-22 · 33 articles · scope: Bambu Studio only (Bambu Handy & Bambu Suite sections omitted).

Images and cross-links point back to the live wiki. This is a snapshot; check the source for the latest revisions.

---

## Contents

**Quick Start**

- [Bambu Studio Quick Start Guide](#bambu-studio-quick-start-guide)
- [Remote Control & Monitoring](#remote-control--monitoring)
- [Multi-Color Printing](#multi-color-printing)
- [Use AMS on Bambu Studio](#use-ams-on-bambu-studio)
- [Flow Rate Calibration](#flow-rate-calibration)
- [Flow Dynamics Calibration](#flow-dynamics-calibration)
- [Multi-device Management](#multi-device-management)
- [View slicing information](#view-slicing-information)
- [Print options](#print-options)
- [Bambu Studio Multi Plate Printing Guide](#bambu-studio-multi-plate-printing-guide)
- [Bambu Studio MacOS frequent operations guide](#bambu-studio-macos-frequent-operations-guide)
- [Bambu Studio Filament Package Update](#bambu-studio-filament-package-update)
- [Bambu Studio 3mf Compatibility](#bambu-studio-3mf-compatibility)
- [Introduction to the printable range of H2D dual nozzles](#introduction-to-the-printable-range-of-h2d-dual-nozzles)
- [Introduction to Filament Grouping Strategy for Dual Nozzle Printers](#introduction-to-filament-grouping-strategy-for-dual-nozzle-printers)

**Toolbar**

- [Bambu Studio Toolbar (Top Toolbar & Right-click Tools)](#bambu-studio-toolbar-top-toolbar--right-click-tools)

**Print Settings**

- [Setting Guide of Slicing Parameters](#setting-guide-of-slicing-parameters)
- [How to Create Custom Preset](#how-to-create-custom-preset)
- [Auto Cooling in Filament Settings](#auto-cooling-in-filament-settings)
- [Seam](#seam)
- [Support settings](#support-settings)
- [Brim](#brim)
- [Object List](#object-list)
- [Auto Circle Holes-contour Compensation](#auto-circle-holes-contour-compensation)

**Troubleshooting**

- [Failed to Get Network Plugin](#failed-to-get-network-plugin)
- [Bambu Studio crashes when connecting to the camera](#bambu-studio-crashes-when-connecting-to-the-camera)
- [Bambu Studio does not load on Windows](#bambu-studio-does-not-load-on-windows)
- [Camera Feed Trouble Shooting](#camera-feed-trouble-shooting)
- [Bambu Studio crashes/freezes troubleshooting guide](#bambu-studio-crashesfreezes-troubleshooting-guide)
- [Bambu Studio login and binding printer troubleshooting](#bambu-studio-login-and-binding-printer-troubleshooting)
- [Slicing crashed on Windows troubleshooting](#slicing-crashed-on-windows-troubleshooting)
- [Bambu Lab Account Two-Factor Authentication / 2FA](#bambu-lab-account-two-factor-authentication--2fa)

**Release Notes**

- [Bambu Studio Release Notes](#bambu-studio-release-notes)

---


## Quick Start

### Bambu Studio Quick Start Guide

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/studio-quick-start>_

#### What is Bambu Studio?

**Bambu Studio** is based on PrusaSlicer by Prusa Research, which is from Slic3r by Alessandro Ranellucci and the RepRap community.

Bambu Studio is our cutting-edge, feature-rich slicing software developed by Bambu Lab, which is used to prepare the files for 3D printing. It contains project-based workflows, systematically optimized slicing algorithms, and an easy-to-use graphic interface, bringing users an incredibly smooth printing experience.

![studio_en.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/studio_en.png)

#### System Requirements

- Windows 10 or higher
- Mac OS X v10.15 or higher
- Linux Ubuntu 20.02 or higher/Fedora 36 or higher (Linux version needs to be downloaded from [github](https://github.com/bambulab/BambuStudio/releases))
- Intel® Core 2 or AMD Athlon® 64 processor; 2 GHz or faster processor
- OpenGL 2.0-capable system
- Recommend 8GB RAM, at least 4GB
- 2.0 GB or more of available hard-disk space

#### Download & Installation

1. Download [Bambu Studio](https://bambulab.com/download)
2. Install Bambu Studio by following the step by step guide

#### Setup Wizard

##### Select Login Region

The first step is to select the region you are located in. A user account registered in North America for example, cannot log in if the region is set to China.

![](https://wiki.bambulab.com/software/bambu-studio/quick-start/select_region.png)

##### Printer Selection

Choose the printers/nozzles that you would like displayed in the slicer operation menu. You may select any or all of the options available to you. These options can be altered at a later stage through the slicer menu should you wish to only choose one at this stage and decide to change nozzle size at a later stage.

![](https://wiki.bambulab.com/quick-start-guide/print_selection.png)

##### Filament Selection

Select the filaments you would like to see listed in the filament preset list, you can choose as many as are available.

![](https://wiki.bambulab.com/software/bambu-studio/quick-start/select_filament.png)

##### Install Bambu Network Plug-in

The Bambu Network plug-in provides networking capabilities, such as printing via WAN/LAN, remote control, user data sync. The plugin installation requires Internet connection and will be auto-installed (if enabled) after the setup wizard.
 ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/install_plugin.png)

#### First Print

##### Log in to your account (optional, but strongly recommended)

***[Prerequisite]: You will need the BambuNetworking plugin in order to log in***.
 This is required to enable print history which allows you to reprint your history models on the Bambu Handy app. Also, your user settings can be synchronized to Bambu Cloud in order to share information among your PC devices.
 ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/sign_in.png)

> **Note:** Since the printer and Studio cannot refresh or call the interface automatically at regular intervals, after changing the nickname, users need to unbind and rebind the printer.
>  For Studio, please log out and log in again to display the updated nickname.

##### Connect the Printer to the Bambu Studio

Before initiating a print job, you must bind your printer to Bambu Studio.
 If you have already completed this step during the initial setup phase, you can skip it—this is just a reminder. This enables device status monitoring, remote task initiation, and control. You can bind your printer using either the Bambu Handy mobile app or the Bambu Studio desktop client.

**1. Bambu Handy**
 Open the app, navigate to the **Devices tab** at the bottom, and tap **“+ Bind Printer”**.
 ![1280x1280_(1).png](https://wiki.bambulab.com/software/bambu-studio/quick-start/1280x1280_(1).png)
 Once the printer is successfully bound, simply log into the same account in Bambu Studio to sync your device list.

> We recommend using Bambu Handy for printer binding, as it supports all Bambu series printers. If you want to learn more about Bambu Handy, you can refer to this wiki: [Bambu Handy Quick Start Guide](https://wiki.bambulab.com/en/studio-handy/handy/bambu-handy-quick-start)

**2. Bambu Studio**
 You can also bind your printer directly within the Bambu Studio desktop application. There are two available methods:

- **Bind via PIN code** (Available for P Series and A Series only).
- **Bind via IP address and access code** (Requires the printer to be in LAN mode; suitable for isolated networks or environments without internet access).

![1280x1280_(2).png](https://wiki.bambulab.com/software/bambu-studio/quick-start/1280x1280_(2).png)

> For detailed steps, please refer to the following wiki resources:
>
> 1. [Binding a Printer in Bambu Studio Using a PIN Code](https://wiki.bambulab.com/en/bambu-studio/manual/pin-code)
> 2. [Using LAN Mode on a Bambu Lab Printer](https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode)

After successfully binding your printer, navigate to the **Device** section to check its status and ensure that everything is ready for the print task.

##### Create a new project

To start slicing a model, click on **New Project**.
 ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/create_project.png)

##### Add a model

On the top toolbar of the preview pane, click on the first icon **add** to import a model. You can also drag and drop model files from a folder into Studio. Supported files include .3mf .stl .stp .step .amf .obj.
 ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/add_stl.png)

##### Select Printer/Filament/Process presets

To start slicing the model, you need to choose the presets for the machine you are using, for the filament you will print with and also the settings you want to print the model in.

1. Select the printer you are using from the drop-down list under **Printer**. This will also include the nozzle size you will be printing with
2. Under the **Filament** section, select the type of filament you intend to use from the drop-down list
3. Choose the layer height you want your model to be printed in from the **Process** drop-down menu. **Always remember that the smaller the layer height, the longer the print will take. For the majority of prints, a 0.20mm layer height is the norm.**    ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/select_presets.png)

##### Slice plate

- Once done, click on the **Slice** button located on the top hand right of Bambu Studio.    ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/slice.png)
- If the model file contains multiple disks, click **Slice All** in the upper right corner of the screen.    ![切片所有.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/%E5%88%87%E7%89%87%E6%89%80%E6%9C%89.png)

Once done, the slicer will take you to the Preview pane which will show you what the sliced model looks after processing the .3mf file. The histogram on the right hand side will also show you information on the printing times for each parameter of the print.
 ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/sliced.png)

##### Send print job

###### Print plate

Click **Print** on the top right-hand corner. This will prompt a pop-up window with a quick preview of the model and will also ask you to select the Printer you want to send it to from the drop-down list, and you will also give you the option to choose whether or not you want the printer to perform certain functions like Bed Leveling, flow calibration, etc before the print starts. Once done, click “Send” to send the file to the printer and start printing.

![print_plate-.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/print_plate-.png)

###### Print all

Please click [Bambu Studio Multi Plate Printing Guide](https://wiki.bambulab.com/en/studio-handy/multi-plate-printing) for more information.

> **Note**:You will need to have Bambu Network plug-in installed to be able to send files via WLAN, and make sure that the Bambu Studio and the printer are on the same LAN.

###### Send/Send all

- Click the arrow on the left of **Print plate** in the upper right corner of the screen, select **Send**.

![send_to_sd.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/send_to_sd.png)

- If the model file contains multiple disks, click the arrow on the left of **Print plate** in the upper right corner of the screen, and select **Send all**. A **Send to Printer MicroSD card** window will pop up on the screen. Select the printer to send to, and the model file can be sent to the SD card of the printer.

![send_all-.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/send_all-.png)

> **Note**: Make sure that the Bambu Studio and the printer are on the same LAN.

###### Export plate/all sliced file

- Eject the printer SD card from the printer and insert it into your computer. Click the arrow to the left of **Print plate** in the upper right corner of the screen and select **Export plate sliced file**, click the selected **Export plate sliced file** to confirm.

![export--.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/export--.png)

- If the model file contains multiple disks, you can click the arrow to the left of **Print plate** in the upper right corner of the screen and select **Export all sliced file**.

![xport-all.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/xport-all.png)

A file explorer window will pop-up in order for you to select the location of the SD card. Then, click on **Save** and the file will be exported to the SD card.
 ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/export_to_sdcard.jpg)

Once saved, take the SD card and insert it into the tiny slot located on the right-hand side of the Printer Display screen. Press the **Home** icon on the left-hand menu selection on the screen, tap **Print Files**, then select **SD Card** option from the top menu. Click on the file you just exported to start printing.

![查看_sd_卡-en.png](https://wiki.bambulab.com/software/bambu-studio/quick-start/%E6%9F%A5%E7%9C%8B_sd_%E5%8D%A1-en.png)

> **For a detailed guide to printing from the SD card for each model, see：**
>  [How to print from Micro SD Card on Bambu Lab X1](https://wiki.bambulab.com/en/x1/manual/print-from-sd-card)
>  [How to print from SD card using Bambu Lab P1 Series 3D printer](https://wiki.bambulab.com/en/p1/manual/how-to-print-from-sd-card)
>  [How to print from SD card using Bambu Lab A1 Series 3D printer](https://wiki.bambulab.com/zh/a1/manual/how-to-print-from-sd-card)

###### Send to Multi-device

Please click [Multi-device management](https://wiki.bambulab.com/en/software/bambu-studio/multi-device-management#Sending-a-Job-to-Multiple-Devices) for more information.

#### Remote Control

Going to the **Device** surface on the Studio will allow you to control and monitor the print remotely in real time (Please check this wiki: [remote-control](https://wiki.bambulab.com/en/software/bambu-studio/remote-control)). If you have a camera installed in your machine (Standard on the X1C), you can also watch a live feed of the print remotely

> ***Note: You will need to have Bambu Network plug-in installed to be able to access the machine through this process***.
>  ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/remote_control_and_monitor.png)

#### End Notes

> *We hope the detailed guide provided has been helpful and informative.*
>
> *To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [technical ticket](https://bambulab.com/en/my/support/tickets?from=5) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.*

### Remote Control & Monitoring

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/remote-control>_

Bambu Studio supports full remote control and monitoring of printers via network (WAN/LAN). Here are a few of the features:

#### Features

**Remote Printing** Send a print job to connected printers via Wi-Fi.

**Monitor print jobs** Show the progress of the current print job. Start, stop, or pause your current print job.

**Webcam LiveView** Watch the webcam LiveView to visually monitor what your printer is doing.

**Control printers** Control bed temperature, nozzle temperature, speed level, fan on/off, move the tool head along XYZE, calibrate the printer, and adjust AMS settings.

**Update device firmware** Update the firmware of the printer and AMS via the network.

**Two network modes** Switch between Auto (use WAN and LAN accordingly) and LAN-only network modes.

#### Preparation

##### Install the network plugin

The Bambu Network Plugin is required for the remote control and monitor features in Bambu Studio. If it is not installed, you cannot send a print job via the network, and the "Device" page will be unavailable. If you try to select the Device tab with no printers bound to your account, you will be prompted to install the required plugin.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_devices_tab_install_bbl_network_plugin.gif)

##### Register/Login

To bind a printer for remote control, you will first need to use the Login/Register button on the Bambu Studio home page.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/login-register_button.png)

##### Bind a printer

If no printer is bound to your account, you can bind your printer, [as outlined in this article](https://wiki.bambulab.com/en/knowledge-sharing/printer-account-binding-guide). We will bind a P1S printer below as an example.

Select the Account: Not logged in option in the settings menu.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/p1s_options_screen.png)

Ensure that the selected Region is accurate. Then, once the PINCODE is generated, copy it down. Note: copy the pin code displayed on your own printer, not the one pictured.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/p1s_bind_account_screen.png)

Enter the pin code into Bambu Studio by selecting the **No Printer** option in the Device tab, then selecting **Bind with pin code**.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_add_printer_with_pin.gif)

Return to the printer, where the screen should now display two options, **Bind** and **Reject**. Confirm that the user name displayed matches yours which is logged into your Bambu Studio, then select **Bind**.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/p1s_bind_prompt_screen.png)

The screen should then confirm that the account is logged in as shown.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/p1s_confirm_bind_account_screen.png)

In Bambu Studio, close the Bind with pin code window and select the **No Printer** option once more. The name of the printer just bound should now show. Select it, and the printer should connect.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_add_printer_after_pin_entered.gif)

More printers may be bound to the same account in the same way. When there is more than one printer bound to an account, they will all show and be selectable in the list as shown in the last step.

#### Main Feature Introduction

##### Remote Printing

Once a print is prepared and sliced, we can send the file to the printer wirelessly using Bambu Studio.

Note, for multicolor printing, the set up and options for sending to a printer (with an AMS installed) are outlined in [this Multi-Color Printing article](https://wiki.bambulab.com/en/software/bambu-studio/multi-color-printing).

After a single color print job has been sliced in Bambu Studio, it can be sent to a printer bound to the Bambu Studio account by selecting the desired printer in the drop down and confirming.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_send_print.gif)

##### Controlling the print job

Once the printer stops, the progress can be monitored at the bottom.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_print_progress_bar_timelapse.gif)

Prints can be paused (or permanently stopped) and resumed with the associated buttons next to the progress bar.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_print_pause_resume.gif)

##### Webcam LiveView

If the webcam view is off, it may be turned on using the button in the lower left. The view is not available when the printer is off, not connected to Wi-Fi, or while it is downloading a print file.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_print_camera_feed_start_stop.gif)

##### Controlling the printer

After the printer is selected, we can use the 'Control' widgets in the right panel of the 'Device' Page for the following controls:

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_printer_control_panel.png)

1. X/Y/Z/E move
2. Nozzle temperature
3. Bed temperature
4. Chamber temperature (depending on printer model)
5. Fan Speed Control
6. Printing Speed Level (while printing)
7. Lamp

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_remote_printer_control.gif)

We can use the **Print Options** button to set some of the following options (available options depend on printer model) when printing:

- **AI Print monitoring** (H2D/X1C series only) - the printer detects [spaghetti](https://wiki.bambulab.com/en/knowledge-sharing/Spaghetti_detection) and filament buildup in the waste chute during printing and pauses printing to prevent issues
- **First Layer Inspection** (H2D/X1C series only) - the printer inspects the quality of the first layer and provides a warning for any abnormalities
- **Auto-recover from step loss** - the printer will sense when print head movement is impeded and re-home before resuming

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_x1_series_print_options.gif)

We can also click the **Calibration** button to start the printer calibration process when not printing.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_printer_calibration_start.gif)

If an AMS is installed on the selected printer, we will also see the AMS filaments displayed. We can manually add non-RFID (non-Bambu Lab) filament information, load and unload filaments in the AMS to the nozzle, and set the AMS settings.

![](https://wiki.bambulab.com/software/bambu-studio/remote-control/bambu_studio_ams_control.gif)

##### Two network modes

Bambu Studio Supports two network modes:

Auto mode: it communicates with the printer via internet and local area network accordingly. The print file will be transferred to the cloud server to make the printer download from the remote. And it also helps to support printing again from the print history list in Bambu Handy. All the information and file is visible only to the user who sent the print task. By default the print files will be removed automatically after 90 days from the first printing. User can remove print files from cloud one by one from the Bambu Handy App's print history menu, or auto remove all new print files by enabling the "Incognito Printing" option in App settings.

LAN mode: it communicates with the printer via the local area network. No print information and files will be transferred to cloud server in this mode. It's safe for cases when the printed content needs to be kept highly secret. (Please know more about it: [How to enable LAN Mode on X1 / P1 series printers](https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode))

The printer is in Auto mode by default. We can turn on the "LAN Only" option on the printer from the "Network settings." To see a detailed step by step, take a look at the [How to enable LAN Mode]([https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode](https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode)

#### End Notes

> *We hope the detailed guide provided has been helpful and informative.*
>
> *To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a* [*technical ticket*](https://bambulab.com/en/my/support/tickets?from=5) *regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.*

### Multi-Color Printing

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/multi-color-printing>_

![](https://wiki.bambulab.com/software/bambu-studio/filaments/color_printing_group.png)

Welcome to the colorful world! Multi-Color printing is one of the most amazing features of Bambu Studio. After importing a model, you can complete a colorful model in just several steps:

1. Add filaments according to the colors that you want. If you want to use support filament for better overhang quality, please also add it.
2. Colorize the model.
3. Slicing & Print.

#### Manage Filaments in a Project

Filaments in a project are all listed in the `Filament` block of the left sidebar.

![](https://wiki.bambulab.com/software/bambu-studio/filaments/filaments_list.jpg)

In `Filamemt` block, you can complete all filament management tasks:

- **Add a filament**    Click the ➕ button to add a new filament to the project. The newly added filament will be appended to filament list.
- **Delete a filament**    Click the ➖ button to remove the last (with the largest index).
- **Set colors/types of filaments**    Set the filament type and color for each filament. When a printer is connected, you may quickly copy the color&type from an AMS slot.

![](https://wiki.bambulab.com/software/bambu-studio/filaments/filament_type_and_color.gif)

- **Config the visibility of filament types**    You may configure the visibility of each filament type in the `Filament Selection` dialog by clicking ⚙. Only selected filament types are visible in the combo box's dropdown list.

![](https://wiki.bambulab.com/software/bambu-studio/filaments/filament_wizard.png)

The filament list is also saved in the 3mf project file and will be restored when loading the 3mf file.

#### Colorize Your Model

Bambu Studio provides versatile colorizing tools for various types of models.

##### Set filament for object/part

You can bind a filament to an object or part in multiple ways:

**Select filament for objects/parts in the object list on the left sidebar**

![](https://wiki.bambulab.com/software/bambu-studio/filaments/select_filament.png)

**Right click target object/part and select filament from the context menu**

![](https://wiki.bambulab.com/software/bambu-studio/filaments/change_filament.png)

**Select the object, and use the shortcut key 1-9 to bind** **the corresponding filament to selected objects/parts**

*Tips: If you can't find the object list, you need to switch to Global/Object mode here*

![global_objecct_mode.png](https://wiki.bambulab.com/software/bambu-studio/filaments/global_objecct_mode.png)

##### Paint on an Object

Bambu Studio provides a powerful `Color Painting` tool. This tool allows you to paint almost anything in different colors on the selected object.

![](https://wiki.bambulab.com/software/bambu-studio/filaments/object_before_painting.png)

![](https://wiki.bambulab.com/software/bambu-studio/filaments/object_after_painting.png)

The left image shows the original model and the right image shows the painted model.
 For more detail, please refer to [color-painting-tool](https://wiki.bambulab.com/en/software/bambu-studio/color-painting-tool)

#### Set Slicing Parameters for Multi-Color

For a single extruder printer, each time filament change happens, a small amount of filament is left in the extruder. As the new filament is loaded, it starts pushing the old filament outside of the extruder & nozzle. During this time, you’ll see a gradual change in the color of the extruded filament.
 Thus, to make sure the model's color is not messed up, it requires enough new filament volume (flushing volume) to flush out the old filament.

![](https://wiki.bambulab.com/software/bambu-studio/reduce-wasting-during-filament-change/print_not_clean.png)

But too much flushing volume means wasting filament and print time. Features described in [reduce-wasting-during-filament-change](https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change) introduce how to print the desired color effect and reduce the wasted filament.

![](https://wiki.bambulab.com/software/bambu-studio/reduce-wasting-during-filament-change/wasted_filament_in_printing.jpg)

#### Use AMS to Print Multi-Color Model

When printing with AMS, the filament list in the sliced project does not necessarily need to be exactly the same as the AMS filament list.

When sending the print task, the filament mapping from the slice project to AMS is automatically built according to the color and material type (PLA/ABS/PC...)

##### AMS operations

###### Loading Filament

Select a tray to load filament. When the indicator starts breathing, push the button forward and insert the filament until it is pulled in automatically.
 ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-1.png)

###### Filament Indication

- **White ON**    The tray is loaded but not use. Filament can be pulled out. (push the button to release if feel blocked)
- **White Breathing**    The tray is busy, do not pull out the filament.
- **Red**    Possible filament status error. Please check error messages or contact customer service.    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-2.png)

###### AMS Control Interface

Icon Description:

- RFID reading buttons and indicators.
- Filament color and type incication.
- Edit or view filament info.    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-1.png)

##### AMS Mapping

- **Check the filament type and color in AMS**    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-1.png)
- **Set the filament type and color by clicking the edit icon**    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-set-filament.gif)
- **Bambu Studio AMS mapping**    Bambu Studio will do AMS mapping (matching the filament type and color) to the current print job. The above part of the AMS mapping widget is the source color and type for the current project and the bottom part is the target index and color of the AMS slot.

> Notice that this is extremely similar for both single nozzle (left) and dual/multi-nozzle printers (right).

| ![](https://wiki.bambulab.com/software/bambu-studio/multi-color-printing/bambu_studio_filament_mapping_single_nozzle.jpg) | ![](https://wiki.bambulab.com/software/bambu-studio/multi-color-printing/bambu_studio_filament_mapping.png) |
| --- | --- |

> If **Multi-device management** is enabled, automatic mapping cannot be performed. This can be set in **Preferences**.
>
> | ![](https://wiki.bambulab.com/studio-ams/preference.png) | ![](https://wiki.bambulab.com/studio-ams/screenshot-20240918-185759.png) |
> | --- | --- |
>
> You should select the printer you want to work with in the **Device** screen, and then in the **Prepare** screen, click the sync icon and then click **Resync**.
>  ![screenshot-20240918-162436.png](https://wiki.bambulab.com/studio-ams/screenshot-20240918-162436.png)
>  ![screenshot-20240918-162822.png](https://wiki.bambulab.com/studio-ams/screenshot-20240918-162822.png)

The automatic mapping matches filament with the same type and similar color.
 Normally, you don't need to modify anything. But if you are not satisfied with the result of the automatic mapping, then modify it manually.

- **Adjust the mapping manually as seen below**    ![manual_filament_mapping_before_print.gif](https://wiki.bambulab.com/software/bambu-studio/multi-color-printing/manual_filament_mapping_before_print.gif)

##### Synchronizing AMS Filament

Instead of waiting until sending the print to map Project Filaments to the available AMS and printer filaments, we can synchronize the AMS filaments with the project filaments in two ways.

To do this, first select the **Synchronize filament list from AMS** button as shown below.

![bambu_studio_filament_sync_button.png](https://wiki.bambulab.com/software/bambu-studio/multi-color-printing/bambu_studio_filament_sync_button.png)

###### Mapping

The first option is Mapping the filaments from the AMS to the Original Project Filaments by matching filament type and color, then allowing manual editing. This is similar to how this is done when sending a print, however, synchronizing now updates the project filaments and cannot be automatically reversed.

1. Mapping Filament Synchronization Mode
2. Original project filaments to be mapped to
3. AMS filament mappings to those project filaments (can be manually changed)
4. Option to add unused filaments to the end of the project filaments list (if unchecked, any unused filaments will not be synchronized)
5. Option to merge identical AMS filaments into one project filament
6. Button to complete synchronization

![bambu_studio_filament_sync_mapping.png](https://wiki.bambulab.com/software/bambu-studio/multi-color-printing/bambu_studio_filament_sync_mapping.png)

> This method can be used whenever desired to update the Project Filaments to be in sync with the available printer filaments.

###### Overwriting

The second option is overwriting the project filaments with whichever filaments are in the first available AMS filaments, in order. This method is automatic and does not allow manual editing of the mappings of the filaments.

Additional filaments present in the other AMS slots are also added as project filaments, resulting in the Project Filaments list reflecting all printer filaments.

1. Overwriting Filament Synchronization Mode
2. Automatic AMS to Original project filament mapping
3. Button to complete synchronization

![bambu_studio_filament_sync_overwriting.png](https://wiki.bambulab.com/software/bambu-studio/multi-color-printing/bambu_studio_filament_sync_overwriting.png)

> This method is generally most useful when done before painting models, in order to synchronize all available AMS and printer filaments into the project to be used for painting.

### Use AMS on Bambu Studio

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/use-ams-on-bambu-studio>_

This is a guide to using AMS on Bambu Studio, including AMS operations, the control interface, and AMS mapping.

> For specific coloring and parameter settings in Bambu Studio, please refer to [Multi-Color Printing](https://wiki.bambulab.com/en/software/bambu-studio/multi-color-printing).

#### AMS operations

##### Loading Filament

Select a tray to load filament. When the indicator starts breathing, push the button forward and insert the filament until it is pulled in automatically.
 ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-1.png)

##### Filament Indication

- **White ON**    The tray is loaded but not in use. Filament can be pulled out. (push the button to release it if it feels blocked)
- **White Breathing**    The tray is busy, do not pull out the filament.
- **Red**    Possible filament status error. Please check error messages or contact customer service.    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-2.png)

##### AMS Control Interface

Icon Description:

- RFID reading buttons and indicators.
- Filament color and type indication.
- Edit or view filament info.    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-1.png)

#### AMS Mapping

- **Check the filament type and color in the AMS.**    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-1.png)
- **Set the filament type and color by clicking the edit icon**    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-set-filament.gif)
- **Bambu Studio AMS mapping**    Bambu Studio will do AMS mapping (matching the filament type and color) to the current print job. The above part of the AMS mapping widget is the source color and type for the current project and the bottom part is the target index and color of the AMS slot.    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-3.png)

> If **Multi-device management** is enabled, automatic mapping cannot be performed. This can be set in **Preferences**.
>
> | ![](https://wiki.bambulab.com/studio-ams/preference.png) | ![](https://wiki.bambulab.com/studio-ams/screenshot-20240918-185759.png) |
> | --- | --- |
>
> You should select the printer you want to work with in the **Device** screen, and then in the **Prepare** screen, click the sync icon and then click **Resync**.
>  ![screenshot-20240918-162436.png](https://wiki.bambulab.com/studio-ams/screenshot-20240918-162436.png)
>  ![screenshot-20240918-162822.png](https://wiki.bambulab.com/studio-ams/screenshot-20240918-162822.png)

- **Adjust the mapping manually as seen below**    ![](https://wiki.bambulab.com/software/bambu-studio/ams/ams-mapping-select.gif)

### Flow Rate Calibration

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/calibration_flow_rate>_

#### What is Flow Rate Calibration?

Flow rate refers to the amount of filament the printer's extruder pushes out of the nozzle, measured as a percentage or multiplier of the default amount. It controls the thickness of the extruded plastic. Adjusting it fine-tunes print quality. If the Flow Rate is too high, it causes overextrusion (blobs or lines that overlap too much), and if it's too low, it causes underextrusion (gaps in the printed lines).

Different 3D printing filaments require varying flow rates due to their differing viscosities and melting points. PLA flows easily, ABS and nylon are slightly thicker, PETG is sticky, TPU is flexible and viscous, polycarbonate is tough, and composites can be abrasive. Flow rates must match each filament's properties to ensure smooth extrusion for the expected print quality.

To use the same example as above, the flow rate can be compared to the speed at which the toothpaste comes out. If you gently squeeze the tube, the line is thin and neat. If you squeeze too hard, the line gets thick and messy.

![](https://wiki.bambulab.com/software/bambu-studio/calibration/flow_rate_pic.jpg)

#### When Do You Need to Do Flow Rate Calibration?

Perfecting your prints involves several calibration steps that must be implemented correctly before proceeding with Flow Calibration. Not all defects in 3D printed objects are the result of inaccurate flow rates. In fact, when using high-quality printers like Bambulab and official Bambu filaments, mechanical tolerances are minimal, and the filament standard is extremely high. Therefore, any defects noticed in your prints may result from other calibration aspects that need addressing.

If you notice the following signs in your 3D prints and have already performed other calibrations, such as Flow Dynamics Calibration, but issues persist, then it might be time to consider a Flow Rate Calibration:

**1. Over-Extrusion:** If you see excess material on your printed object, forming blobs or zits, or the layers seem too thick, it could be a sign of over-extrusion.

**2. Under-Extrusion:** This is the opposite of over-extrusion. Signs include missing layers, weak infill, or gaps in the print. This could mean that your printer isn't extruding enough filament.

**3. Poor Surface Quality:** If the surface of your prints seems rough or uneven, this could be a result of an incorrect flow rate.

**4. Weak Structural Integrity:** If your prints break easily or don't seem as sturdy as they should be, this might be due to under-extrusion or poor layer adhesion, which can be improved by flow rate calibration.

Beyond fixing the noted printing defects, Flow Rate Calibration is crucial for foaming materials like LW-PLA used in RC planes(you can refer to [Instructions for printing aircraft model with foaming PLA (PLA Aero) | Bambu Lab Wiki](https://wiki.bambulab.com/en/knowledge-sharing/studio-settings-for-rc-models)). These materials expand greatly when heated, and calibration provides a useful reference flow rate to achieve good printing results with these special filaments.

#### Is Flow Rate Calibration Reliable?

Auto Flow Rate Calibration utilizes Bambu Lab's Micro-Lidar technology (refer to [Automatic Flow Calibration with Bambu Lab Micro Lidar | Bambu Lab Wiki](https://wiki.bambulab.com/en/knowledge-sharing/flowrate-calibration-by-microlidar)), which directly measures the calibration patterns. However, please be advised that the efficacy and accuracy of this method may be compromised with specific types of materials. Particularly, filaments that are transparent or semi-transparent, sparkling particles, or have a high-reflective finish may not be suitable for this calibration and can produce less-than-desirable results.

The calibration results may vary between each calibration or filament. We continue to improve the accuracy and compatibility of this calibration through ongoing firmware updates. Manual calibration, on the other hand, can be accurate, but it’s important to follow the correct procedure.

#### Modes of Calibration

Flow Rate calibration has two modes: Auto-Calibration and Manual Calibration.

- **Auto-Calibration:** The user only needs to start the calibration, and the printer will return the calibration results after the printing is finished. Only X1 series support Auto calibration.
- **Manual Calibration:** The user must judge which parameter to use by observing the quality of the calibration block on the print plate.

#### Types of Manual Calibration

The manual mode includes two types: **Coarse Calibration** and **Fine Calibration**.

- **Coarse Calibration** is based on the flow ratio value of the filament preset and prints the calibration blocks, with flow values in the range of 80% to 120% based on that value. The step size of coarse calibration is 5%. When you are unsure about the flow ratio of the filament, you can first use coarse calibration to obtain a better range and then use fine calibration to achieve a more accurate value.
- **Fine Calibration** is based on a custom flow ratio value and prints calibration blocks that flow in the range of 91% to 100% based on that value. The step size of fine calibration is 1%. If you already know a reasonable range, and the margin of error is within 10%, you can directly use fine adjustment to get the more accurate value.

#### Flow Rate Calibration Process

##### **Automatic Mode**

###### **Step 1: Open Bambu Studio and Select Auto-Calibration**

After connecting your 3D printer and opening Bambu Studio, go to **Calibration > Flow Rate > Auto-Calibration**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/the-flow-rate-auto-calibration.png)

###### **Step 2: Select the Nozzle, Plate Type, and Filament to be Calibrated**

For the nozzle, we will select a **0.4 mm** diameter, plate-type **Smooth PEI Plate**, and **Bambu ABS** filament in our case.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-rate-settings.png)

If AMS is connected, you will see an option to synchronize filament list information from AMS.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/synchronizing-settings.png)

Select the filament you want to calibrate, and then select the filament preset for printing from the filament radio box. After finishing the settings, click **Calibrate** button.

(Note: Calibration for different nozzle sizes requires support from the printer firmware.) For OTA version 01.06.00.00, only a 0.4mm nozzle is supported.

###### **Step 3: Calibration Printing in Progress**

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-rate-calibration-progress.png)

After printing is finished, you can click the Next button to proceed to the next step.

###### **Step 4: Save Calibration Results**

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-rate-results.png)

After printing is finished, a flow ratio value that the machine determines to be optimal will be returned. You can save this flow value to a new filament preset. If you modify the name to match the original filament preset name used for calibration, you can also overwrite the original filament preset.

##### **Manual Mode**

###### Step 1: Select Manual Calibration

Go to **Calibration > Flow Rate > Manual Calibration**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/manual-calibration-option.png)

###### **Step 2: Select the Calibration Type**

There are two types of manual calibration:

- Complete Calibration
- Fine Calibration based on Flow Ratio

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/calibration-type-in-manual-calibration.png)

- **Complete Calibration:** It will first perform a coarse calibration, and then you can perform a fine calibration based on the results of the coarse calibration.
- **Fine Calibration based on Flow Ratio:** It will perform a fine calibration directly based on the flow ratio you set.

Other steps are the same as the automatic mode.

Once you have entered the required information, you can begin the calibration by pressing the "**Calibration**" button.

###### **Step 3: Complete Calibration in Progress**

![](https://wiki.bambulab.com/software/bambu-studio/calibration/flow_rate_manual_cali_1.jpg)

After the first stage of the Complete Calibration print is done, it's time to **visually determine** which one of the printed samples has the smoothest finish.

Judging the print result below, choosing one of the top three samples is not recommended because the flow rate is too high, resulting in overlapping printed lines. The bottom three samples are under-extruded, and there are gaps between the lines, so we are left to comparing the middle options to choose between 5 and 0 as -5 is under-extruded.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/complete-calibration.jpg)

Between the two samples, the one with value 5 is the smoothest. The lines are smooth throughout the print, whereas the sample with a value of 0 exhibits some under-extrusion.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/smoothest-option.jpg)

At this point, it's time to select the best sample in Bambu Studio (5, based on our test), which will show the best flow rate to use, in this case, **0.997500**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/selecting-flow-rate-value.png)

If you are satisfied with the result, you can choose to skip the fine calibration, known as Calibration 2. But if you wish to fine-tune the flow rate, simply click **Calibrate**. The printer will generate a new set of test samples to generate a finer selection of the flow rate.

> ***Important!***
>
> *The printer will send the new test samples right after you click the Calibrate button.* Ensure the plate is clean and installed in the printer before clicking the button.

As expected, the printer will start printing another set of test samples, to help you better determine the best flow rate value. Simply wait for the print to be completed, then move to the next step.

Just like before, you need to compare the test results, and find the smoothest test sample. This time, it might be a bit more challenging, as some of the test samples will have very minor differences between them. Try to view them with the light coming from the left side and position the samples similarly to the image below.

Pay close attention to the middle section of the test sample rectangles, as it will show any sign of under-extrusion. The start and end of the printed lines might show slight signs of over-extrusion, but that is considered normal.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-rate-calibration-prints.jpg)

It can be observed that most of the negative samples (-2 to -7) have slight under-extrusion, as there are gaps between the printed lines.

The -1 sample seems to be OK at first glance, but looking closer, you can see some very faint signs of under-extrusion between the printed lines. Due to this, it is recommended to avoid using the -1 value, confirming that **0 is the correct result**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/0-value-result.jpg)

> ***Important!***
>
> *Avoid selecting the sample which shows slight signs of under-extrusion. For larger prints, this slight under-extrusion can increase, leading to potential gaps between the printed lines.*

In Bambu Studio, select the sample which is the smoothest, in this case 0, then set the name for the filament preset. The calibration process is completed by clicking the **Finish** button. Your newly calibrated profile will have the new flow ratio applied.

| ![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-rate-results-saved.png) | ![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-ratio-setting-applied-to-filament.png) |
| --- | --- |

#### **Important Notes**

When considering the Flow Dynamics and Flow Rate calibration, it’s critical to pay close attention to the following details to achieve optimal results:

- For the most accurate calibration results, **ensure the filament is thoroughly dried** before beginning the calibration process and remains dry afterward. Variations in filament humidity, even after calibration, can have a small impact on the consistency and reliability of the results.
- Always verify that the hotend is clean, both internally and externally, before proceeding with calibration. If you observe a decline in print quality (such as under-extrusion, over-extrusion, or minor stringing) it’s advisable to perform several cold pulls for the nozzle to clear any potential partial clogs that could interfere with smooth filament extrusion. Alternatively, using a new nozzle can confirm if the issue is related to the nozzle, or to calibration.
- Ensure the extruder is clean, to prevent issues caused by contaminants. Small particles, such as filament dust or residue buildup on the gears, can compromise extrusion quality. If you notice any changes in print quality, **prioritize cleaning the extruder and nozzle before considering recalibration** to ensure consistent results.
- Avoid calibrating with a dirty extruder or a nozzle that is partially clogged, as these conditions can significantly skew the calibration process, leading to unreliable and inaccurate results.
- The build plate needs to be washed before starting the process, to ensure the printed models will adhere as expected, as it can impact the calibration result if the first layer is not attached well to the plate.

#### End Notes

> We hope our guide was helpful. If you have any questions or concerns about the process, please contact our customer service team. We're here to assist you.
>
> [Click here](https://bambulab.com/en/my/support/tickets) to open a new ticket in our Support Page.
>
> We will do our best to respond promptly and provide you with the assistance you need.

### Flow Dynamics Calibration

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/calibration_pa>_

#### Flow Dynamics Calibration

##### What is Flow Dynamics Calibration?

Flow Dynamics is a feature in 3D printing firmware that compensates for the lag in extrusion pressure, improving print quality, especially at higher speeds. When filament is extruded, it takes time for the pressure in the nozzle to build up to a level where plastic flows consistently.

During acceleration, this lag can cause underextrusion, resulting in gaps or thin lines. Conversely, when decelerating, the residual pressure causes excess filament to ooze out, leading to blobs or stringing. These issues worsen with faster print speeds.

Flow Dynamics counter these effects by preemptively adjusting the filament flow:

- **During acceleration**, the Flow Dynamics algorithm increases the extrusion rate slightly to build pressure faster, reducing underextrusion.
- **During deceleration**, the Flow Dynamics algorithm reduces or reverses the filament flow (similar to a mini-retraction) to relieve built-up pressure, preventing oozing.

This results in cleaner corners, sharper details, and more consistent extrusion, especially in complex prints with frequent speed changes.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/calibration/pa_before.png) | ![](https://wiki.bambulab.com/software/bambu-studio/calibration/pa_after.png) |

FAQ: Flow Dynamics Calibration（Click here to view）

**1. What is a K factor?**

The K factor (or K value) is how we measure the amount of flow dynamics compensation applied. The K value is specific to a printer and filament combo, since, as mentioned before, different filaments will compress different amounts, and different printers will have different amounts of play in their extrusion system.

This value is essentially a proportional constant that tells the printer's firmware how strongly to adjust extrusion flow based on the acceleration of the toolhead. A higher K value means more compensation for extrusion rate during toolhead acceleration, and a lower K value means less compensation. In other words, a printer/filament combo with a higher K value has more “slop” or more delay to extrusion commands.

Why the letter “K”? It's just a common letter used to represent constant values. It was used early on to represent this value and stuck.

**2. Is Flow Dynamics Calibration Reliable?**

It depends. There are a few cases that can make the calibration results unreliable:

- The filament is damp, which will render the calibration results unsuitable for use with fresh filament.
- The filament is transparent, which can affect the Lidar scan results on X1 series printers.
- The build plate is not sticky (please wash the build plate or apply glue stick); this causes the calibration lines to not adhere properly, which can impact Lidar scan results on X1 series printers.
- The nozzle is worn out or has internal blockage.
- The material is particularly soft, such as TPU. Flexible filaments, such as TPU, have a high probability of calibration failure.
- A third-party hotend is used. This is especially relevant for the A1 series and H2D printers, where Flow Dynamics Calibration uses an eddy current sensor to detect extrusion pressure. Using a third-party hotend may lead to inaccurate calibration results.

Except for the cases mentioned above, the calibration results are reliable.

**3. Why are Calibration Results Always Not the Same in Each Calibration?**

The calibration results have about 10% jitter in our test. We are still investigating the root cause.

#### When should the Flow Dynamics Calibration be performed?

Bambu Studio has auto-calibration for different filaments, which is fully automated. The result will be saved in the printer for future use. The following are scenarios in which you need to perform flow dynamics calibration:

- When you introduce a new filament from a different brand or model.
- When the nozzle is worn out, increased friction will affect the flow.
- When you replace the nozzle, due to manufacturing tolerances.
- When the maximum volumetric speed or print temperature is changed in the filament settings.

#### Flow Dynamic Calibration Process

Bambu Studio offers two calibration modes: Manual and Automatic.

- **Manual mode:** In this mode, the user must judge which parameter to use by observing the quality of the calibration line on the printed board.
- **Automatic mode:** The user only needs to start the calibration, and the printer will return the calibration results after the printing.

> **Note:** H2D, X1 and A1 series printers support auto calibration. The A1 series printer only supports auto-flow dynamic calibration from firmware version 01.04.00.00. Please ensure the printer firmware and Bambu Studio are updated to the latest version. **P1 supports only manual calibration**.

##### **Automatic Mode**

Automatic flow dynamic calibration is available in H2D, X1, and A1. Before you begin the calibration, ensure the 3D printer is connected. Follow the steps below to use the Automatic mode.

###### **Step 1: Open Bambu Studio and Access Calibration**

Click **“Calibration”, Flow Dynamics**, and thereafter **Auto-Calibration**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/auto-calibration.png)

###### **Step 2: Select the Nozzle, Plate Type, and Filament to be Calibrated**

For the nozzle, we shall select **0.4 mm**, a plate type **Smooth PEI Plate**, and **Bambu PLA Basic** for the filament in our case. If AMS is connected, you will see an option to select the filaments for calibration.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/automatic-flow-dynamic-calibration-settings.png)

Once you have entered the required information, you can begin the calibration by pressing the "**Calibrate**" button.

###### **Step 3: Calibration Process**

The X1 series printer will print calibration lines on the build plate and then use the lidar to scan these lines for auto dynamic flow calibration. The A1 and H2D printers will move the toolhead to the purge wiper to purge the filament and use the eddy current sensor of the toolhead to detect the extrusion force, thereby calibrating the dynamic flow.

|  |  |
| --- | --- |
| **The X1 series printer will print calibration lines on the build plate** | **The A1 series printer will extrude the filament at the purge wiper** |
| ![](https://wiki.bambulab.com/software/bambu-studio/calibration/pa_auto_cali_new.jpg) | ![](https://wiki.bambulab.com/software/bambu-studio/calibration/a1%E5%8A%A8%E6%80%81%E6%B5%81%E9%87%8F%E6%A0%A1%E5%87%86en.png) |

Once finished, you can click the **Next** button to proceed to the next step.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/next-flow-dynamic-calibration.jpg)

###### **Step 4: Analyze the Results**

After clicking Next, the recommended K-value will be displayed. In our case, it is **0.015.**

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/k-value.png)

Then, click '**Finish**,' and the results will be saved to the 3D printer.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-dynamic-calibration-results.jpg)

###### **Step 5: Managing and Saving Calibration Results**

You can also see the results by clicking on **Manage Result**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/manage-results-option.png)

You will see the updated value of Factor K, and you can also edit it.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/factor-k.png)

To prevent corner stacking effects, the Factor K during H2D automatic flow calibration will be set higher than in pattern mode of manual calibration. The automatic calibration of the X1 series uses line drawing and laser radar scanning method, so the K value is smaller than that of the H2D.

Each set of parameters can record a name, and you can modify this name and you can set the Factor K value you want to use for each slot in the material dialog on the device page.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/factor-k-in-device-settings.png)

> **Note**: After our testing, all series of printers using 0.2mm hotend have a high probability of causing inaccurate automatic flow calibration results or calibration failure, so we recommend that you refer to the manual calibration steps below when using 0.2mm hotend to obtain more accurate dynamic flow calibration results.

##### **Manual Mode**

Before you start, make sure your plate is installed on the printer and has been thoroughly cleaned to ensure good adhesion. It's recommended to perform this calibration procedure on a smooth plate, such as the Smooth PEI plate; however, it can also be done on the Textured PEI plate.

###### **Step 1: Correctly** Configure **Filament**

Ensure the filament is correctly configured in the settings. To do this, go to the **Device** tab, **select the type and color of the filament**, and then confirm your selection. In this case, we will use Green Bambu Lab PLA Basic for demonstration purposes. If you haven't already, load the filament into the printer. The loading process will also allow you to select the type of filament.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/extrusion_calibration_p1_s14_d5e9baedd5.jpg)

###### **Step 2: Select the “Manual Calibration”**

Next, navigate to the **Calibration** tab, select **Flow Dynamics**, then click on **Manual Calibration**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/manual-flow-calibration.png)

###### **Step 3: Apply the Settings and Initiate Calibration**

The next step in the calibration process will ask for the following steps:

1. **Click the Sync button** to synchronize the printer's information.
2. **Select the Nozzle Diameter** installed on the printer, in our case, 0.4mm. If you are using H2D, two nozzles will be displayed. You select the option you would like to calibrate.
3. **Select the Plate Type**, in our case, the Smooth PEI Plate.
4. **Select the Filament For Calibration**. It should be automatically detected based on the configuration done in the previous step.
5. **Select the Pattern Method**, which will help visually determine the correct value.
6. **Select the Interval for the test**. It is recommended to use the **value step of 0.002** as it will create more calibration lines to have a finer gradient of results to choose from.
7. **Click Calibrate**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/flow-dynamic-calibration-all-settings.png)

Once you click **Calibrate**, the test file will be sent to the printer. Below is the structure of the design when the **Pattern** Method is selected.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/sending-the-3d-print.png)

If you selected **Line**, it will look like the one below.

![](https://wiki.bambulab.com/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20240822104555.png)

Straight-line in manual flow calibration are less accurate because they don't clearly show extrusion issues like corner patterns do. As a result, they may lead to a lower and less reliable K value.

In this wiki, we are using Pattern for demonstration.

###### **Step 4: Visually Inspect the Printed Pattern**

Once the pattern is successfully printed, you will need to visually determine which of the printed values has **the cleanest printed corner**. The corner should be **as sharp as possible, without any signs of under-extrusion**.

Looking carefully at the test results, a K factor value of 0.006 (represented with 1) would be too low, as the corner is bulging and it's round. On the other hand, starting from the 0.024 K value (represented by 2), we obtain underextrusion in the corner.

Based on this test and the filament used, **the best result is a K value of 0.018** (represented with 3), which is between 0.016 and 0.02.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/extrusion_calibration_3dprinted-test-design.jpg)

Once you have determined the correct value, in Bambu Studio, click **Next**.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/next-in-flow-dynamic.png)

###### **Step 5: Input the Correct Value** in the **K Section and Assign the Name**

Enter the value obtained under the **Factor K** section, assign a new name to the filament profile, and then click **Finish** to complete the calibration.

![](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/using-calibration-results.png)

> **Note**: A1 series and H2D printers use eddy current sensors with a dedicated algorithm for dynamic flow calibration. The automatic calibration value (K value) of the algorithm may sometimes be significantly higher than the manual calibration value, which is normal. This design is intended to avoid filament pile-up problems at the corners of the model by slightly increasing the K value, thereby better ensuring the assembly accuracy between models.

#### Flow Dynamics Calibration Before Printing

If you check "**Flow Dynamics Calibration**" before initiating each printing, the printer will calibrate the flow rate during the printing preparation stage, and this printing task will use the calibrated K value instead of the manually set K value.

> **Note:** P1 series printers do not have this option as they do not support automatic calibration.

![](https://wiki.bambulab.com/20240823-095027.jpg)

##### X1 Series

For the X1 series printer, if "Flow Dynamics Calibration" is checked in the window that sends prints, **it will print a calibration line on the build board during the print preparation stage to calibrate the first filament used in this print job. If multiple filaments are used in this printing task, other materials will** utilize the K value you manually set**. If the K value of materials in other slots has not been manually configured, the default compensation value will be used.** This calibration method will occupy a certain area of ​​the print plate, as shown in the figure below.

![](https://wiki.bambulab.com/20240823-100520.jpg)

##### A Series

For the A series printers, the flow dynamics calibration process involves discharging material at the position of the discharge assembly during the printing preparation stage and calculating the suitable K value for the material based on the pressure changes detected by the eddy current sensor above the hotend. **If "Flow Dynamics Calibration" is checked before printing, a flow calibration will be performed when each filament of this printing task is replaced for the first time, so all materials used in this printing task will be calibrated by flow (supported since version 01.03.00.00).**

***This calibration method is greatly affected by the hotend. Please ensure that you are using the official Bambu hotend. If you use a third-party hotend, the calibration value may be inaccurate.***

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/%E6%B6%A1%E6%B5%81%E4%BC%A0%E6%84%9F%E5%99%A8%E6%A0%A1%E5%87%86%E6%B5%81%E9%87%8F%E7%A4%BA%E6%84%8F%E5%9B%BE_(1).webp) | ![](https://wiki.bambulab.com/a1%E5%B7%A5%E5%85%B7%E5%A4%B4%E5%90%90%E6%96%99%E6%A0%87%E5%AE%9A.webp) |

##### H2D/H2S/P2S/X2D Printer

Similar to the calibration principle of the A1/P2S series printers, the H2D printer also spits out the filament at the purge wiper, and then uses the eddy current sensor inside the toolhead for dynamic flow calibration. For H2D printers, there are three gear options for dynamic flow calibration before initiating a print task, which are explained as follows:

**Automatic**: The system will determine whether the filament (and the nozzle used) for this print has been calibrated in the recent period, and whether the hotend has been replaced. If the filament and nozzle have not changed, the last calibration value will be used directly and no longer calibrated; if there is a change, a dynamic flow calibration will be performed again before printing.

**Open**: Dynamic flow calibration will be performed before each print starts.

**Off**: The system will use the K value (PA profile) you set manually. If there is no profile for the filament in this slot, the system default value (default) will be used.

> **Note: The calibration results of the open and automatic gears will be recorded inside the machine for subsequent judgment when initiating printing.**

##### H2C Printer

For printers equipped with the H2C printhead, the right printhead can automatically switch between multi-nozzle structures, enabling flexible combinations of various nozzles and filaments. Correspondingly, the judgment logic for dynamic flow calibration has been adaptively optimized.

Before initiating a print job, the option settings for dynamic flow calibration remain the same as those for the H2D, still offering three levels with specific descriptions as follows:

**Auto**: The system will check if the filament (and its associated nozzle) for the current print has been calibrated recently and if the hotend has been replaced. If the filament and nozzle remain unchanged, the previous calibration values will be used without re-calibrating; if there are changes, dynamic flow calibration will be performed again before printing.
 **On**: Dynamic flow calibration will be executed before the start of each print.
 **Off**: The system will use the K-value PA profile you manually set. If no profile is configured for the filament in that slot, the system's default values will be applied.

The Auto and On modes do not affect the binding relationship between nozzles and filaments. They only execute the above calibration value judgment logic based on the determined nozzle-filament combination, so their behavior is identical to that of the H2D.

In the Off mode, the system relies on the K-value PA profile manually set by the user in the filament slot. Since the user cannot predict which nozzle will be used for subsequent prints when selecting the PA file, there is no guarantee that the PA file will take effect for a specific print. To address this, we have established new activation rules for manually configured PA files.

**What does the function option "Whether PA parameters apply to the same type of filament and nozzle" mean?**

We will provide this additional option in "Settings" to determine the scope of application for the manually configured K-values:

- Enabled: Indicates that the manually configured K-values will take effect when the type of filament in the slot and the type of nozzle bound before printing **match the filament and nozzle types recorded in the PA file**.
- Disabled: Indicates that the manually configured K-values will only take effect when the filament in the slot and the nozzle bound before printing **are exactly the same as the filament and nozzle recorded in the PA file**.

This function switch is enabled by default. You can manually toggle this switch in the "Settings" option.

![10.jpg](https://wiki.bambulab.com/h2c/manual/calibration_pa/11.jpg)

#### What Happens if You Don’t Calibrate the Flow?

1. If you are on the filament configuration page and have not selected any PA profile for the supplied filament in this slot, and ‘Flow Dynamics Calibration’ is not checked before printing begins, the printer will use the default extrusion compensation parameters. In most cases, it is possible to achieve good printing results with the default parameters

![pa_settings.png](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/pa_settings.png)

![screenshot-20250729-150714.png](https://wiki.bambulab.com/software/bambu-studio/calibration/screenshot-20250729-150714.png)
 2. If you are familiar with the characteristics of a particular filament, you can manually create a PA profile for the consumable filament directly from the Flow Dynamics Calibration Management Result page in Studio. This allows you to configure an extrusion compensation parameter for the filament without calibration, **but this feature is supported by Bambu Studio version 1.9.1 and above.**

![creating-new-filament-profile.png](https://wiki.bambulab.com/software/bambu-studio/flow-rate-calibration/creating-new-filament-profile.png)

Note: H2D printers use a more sophisticated flow calibration algorithm. The compensation value depends not only on the K value but also dynamically adjusts based on the printer model, nozzle, and filament type to ensure good printing results even with default parameters. Therefore, if the PA profile is set to 'Default', the system will no longer display the specific K value.
 ![默认.png](https://wiki.bambulab.com/software/bambu-studio/calibration/%E9%BB%98%E8%AE%A4.png)

If a saved PA profile is selected, the K value will still be displayed, but will only be effective in the 'Off' position.

![custom_dynamic_flow_value.png](https://wiki.bambulab.com/software/bambu-studio/calibration/custom_dynamic_flow_value.png)

#### **Important Notes**

When considering the Flow Dynamics calibration, it’s critical to pay close attention to the following details to achieve optimal results:

- When considering the Flow Dynamics calibration, it’s critical to pay close attention to the following details to achieve optimal results:
- Dry the filament both before and after calibration to prevent print inconsistencies caused by moisture.
- Make sure the hotend is clean. If print quality drops, do cold pulls or change the nozzle to clear clogs.
- Clean the extruder to remove dust or residue. Poor extrusion often comes from dirty gears, not calibration.
- Avoid calibrating with a clogged nozzle or dirty extruder to prevent inaccurate results.
- Wash the build plate to ensure good first-layer adhesion during calibration.

#### End Notes

> We hope our guide was helpful. If you have any questions or concerns about the process, please contact our customer service team. We're here to assist you.
>
> [Click here](https://bambulab.com/en/my/support/tickets) to open a new ticket in our Support Page.
>
> We will do our best to respond promptly and provide you with the assistance you need.

### Multi-device Management

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/multi-device-management>_

#### Managing Multiple Devices with Bambu Studio

This is a guide for managing multiple devices. It explains the process of enabling multi-device management, dispatching tasks to several devices, monitoring the status of various devices and tasks.

##### Enable multi-device management

You can enable multi-device management in the preferences section.

Note: After enabling multi-device management, you must restart Bambu Studio for the changes to take effect. Also, this feature cannot manage printers than are enabled with Only LAN mode.
 ![](https://wiki.bambulab.com/bambu-studio/manual/preferences.png)

Once the multi-device management function is activated, the multi-device management page will appear as a tab.
 ![](https://wiki.bambulab.com/bambu-studio/manual/tab.png)

##### Sending a Job to Multiple Devices

###### Sending a Job to Multiple Devices

After slicing, switch to the "Send to Multi-devices" button and click it to access the sending page.

![](https://wiki.bambulab.com/bambu-studio/manual/sending.png)

1. Currently, when sending tasks to multiple devices, only the same AMS mapping is supported, or you can use the external pool to print with single-color filament.
2. There are two sending options.

- One is determining how many devices can be sent to simultaneously, which generally depends on the number of devices capable of heating the hotbed. Heating the hotbed usually represents the peak power moment, and when multiple machines heat the hotbed simultaneously, there is a risk of overloading your power supply.
- Another option is the interval for dispatching subsequent printing tasks. This depends on how long the previous task has been heating the hotbed. A five-minute interval is generally recommended. Once the hotbed of the previous batch reaches its working temperature and the power load decreases, you can initiate new tasks on other machines.

Note: Maximum 6 devices can be managed.

##### Monitoring Device Status

![](https://wiki.bambulab.com/bambu-studio/manual/devices.png)

You can click the "View" button to check the status of a single device.
 ![](https://wiki.bambulab.com/bambu-studio/manual/view_single.png)

##### Check the Task Sending

The tasks that are being sent and those pending will be displayed in the list.
 ![](https://wiki.bambulab.com/bambu-studio/manual/task_sending.png)

##### View the Tasks That Have Been Sent

You can view the task history of all your sent tasks here.
 ![](https://wiki.bambulab.com/bambu-studio/manual/tasks_sent.png)

### View slicing information

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/view-slicing-information>_

After slicing your model in Bambu Studio, you can view the detailed information of different layers, such as line type, filament, print speed, and printing path. Also, you can add custom operations for any layer, such as a custom G-code, pause, and changing filament.

#### Basic information

##### Line type

Different line types are displayed in various colors. For each line type, you can see its print time, percentage of overall print time, and the length and weight of filament used. For more information, please see [Line width](https://wiki.bambulab.com/en/software/bambu-studio/parameter/line-width).

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/line_type_en.png)

##### Filament

Displays the colors of filaments used, and the length and weight of filament used for printing the model, [flushing](https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change), and [prime tower](https://wiki.bambulab.com/en/software/bambu-studio/parameter/prime-tower).

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/filament_en.png)

##### Speed

Different print speed is displayed in different colors. The bigger the number, the faster the printer will print that area.

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/speed_en.png)

##### Layer height

During FDM 3D printing the model is built layer by layer, so we also consider the layer height as the vertical resolution of the model, that is, the lower the layer height, the higher the fineness of the model. Different layer height is displayed in different colors. The brighter the color, the higher the layer. You can also use the [variable layer height](https://wiki.bambulab.com/en/software/bambu-studio/adaptive-layer-height) function to customize the height of each layer. For more information, please see [layer height](https://wiki.bambulab.com/en/software/bambu-studio/layer-height).

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/layer_height_en.png)

##### Line width

Line width means the width of a single melted filament extruded by the nozzle during the printing. Usually, the width of the extruded material is almost the same as the diameter of the nozzle. Different line widths can affect print quality, speed, strength, and detail. For example, increasing the line width can enhance the interlayer contact area and improve layer adhesion, but it may reduce the level of detail in the model. For more information, please see [line width](https://wiki.bambulab.com/en/software/bambu-studio/parameter/line-width).

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/line_width_en.png)

##### Flow

Displays the volumetric flow rate of filament on various positions. The printer has a maximum limitation on volumetric flow rate for various types of filaments, that is, the maximum amount of filament to be extruded per unit time. **Maximum volumetric flow rate = cross-sectional area of extruded line * maximum printing speed**.

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/flow_en.png)

##### Layer time

Displays the print time for each layer. Normally, the larger the area, the longer the print time.

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/layer_time_en.png)

##### Fan speed

Displays the part cooling fan speed on different layers. The higher the speed, the faster the filament cools down. For more information on cooling, please see [auto cooling in filament settings](https://wiki.bambulab.com/en/software/bambu-studio/auto-cooling).

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/fan_speed_en.png)

##### Temperature

Displays the nozzle temperature of different layers. When printing with one type of filament, the nozzle temperature will be consistent throughout the whole process. If you print with multiple types of filaments (with an AMS), the nozzle temperature may vary.

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/temperature_en.png)

##### How to use

Drag the bars on the right and bottom to see the information and print path of different layers. Use the arrow keys on the keyboard to conveniently navigate one at a time.

The bar on the right shows the model's layer number, layer height, and print time, while the one on the bottom shows the print path of the selected layer.

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/use-1_en.apng)

Select a layer and click ![one_layer_at_a_time_icon.png](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/one_layer_at_a_time_icon.png) on the lower-right corner to see only that layer. Now, drag the bar and you can see one layer at a time. Click the icon again to go back to displaying all layers. If you want to view a specific layer, right-click the "+", select **Jump to Layer**, and enter the number of the layer.

![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/use-2_en.apng)

If you modify any parameters, you will need to slice the model again. If you want to go back to the preparation page, click **Prepare** on the upper-left corner.

Right-click the "+" and you can use the following functions:

- **Add Pause**: If a pause is added to a layer, the printer **will stop before printing that layer**. You need to manually resume printing. For example, adding a pause to layer one will cause the printer to stop before printing layer one. (Tips: Add a pause to layer one so that the printer will stop before printing layer one. Then, you can remove the flow calibration lines on the build plate, and then manually resume printing. Now, the flow calibration lines will not occupy the area on the build plate, allowing you to print models with larger first layers.)    ![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/use-3_en.apng) ![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/pause.png)
- **Add Custom G-code**: Custom G-code can be added to a layer to achieve various personalized settings. For example, M104 S250 means to heat up the nozzle to 250 °C before printing the layer. The temperature tower function can be done by adding different G-code to specified the printing temperature of different layers.    ![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/use-5_en.apng)
- **Change Filament**：This function allows you to change filament at any layer. Please note that this function can only be used with an [AMS](https://wiki.bambulab.com/en/ams).    ![](https://wiki.bambulab.com/software/bambu-studio/view-slicing-information/change_filament_en.apng)

#### Applications

This function is useful for you to adjust the printing parameters better and improve the print quality.

- **Inspect print path**: By inspecting the print path layer by layer, you are able to check if the G-code is generated by Bambu Studio as expected. This allows you to discover and rectify potentials issues in advance.
- **Meet personalized needs**: Pausing during printing allows to you embed objects, such as a magnet, into the model. These objects can be securely locked inside after the print is complete.
- **Optimize support structure**: Checking the support structure on different layer makes it possible to optimize the generation methods and positions. Make sure areas are getting enough support and remove unnecessary support. Also, ensure the contact points between the model and support are reasonable to reduce the impact on the surface quality of the model. For more information on support, please see [Support](https://wiki.bambulab.com/en/software/bambu-studio/support).
- **Adjust infill patter**: Check the infill pattern (such as grid, triangles and honeycomb) to optimize the infill pattern. The infill density can be both appropriate for the model strength and reduce filament waste. Additionally, the infill direction should be reasonable to improve the structural strength of the model.
- **Evaluate layer height settings**: Evaluate the effect of the current layer height settings on the details and surface quality of the model. Consistent layer heights across the model can avoid print qualities such as ripples on the surface. If smaller layer heights are configured, see if they are appropriate for the positions that need more details.
- **Speed up printing**: Make necessary optimizations to shorten the print time of areas that need longer to print.
- **Analyze for potential issues**: Check through the layers to discover and solve potential problems in advance. For example, identify overhangs and ensure adequate support or adjust the print parameters to reduce overhangs; check the print paths in transition areas to ensure smooth transitions and avoid poor inter-layer adhesion.

#### End notes

> We hope that the detailed guide we shared with you was helpful and informative.
>  We want to ensure that you can perform it safely and effectively. If you have any concerns or questions regarding the process described in this article, we encourage you to reach out to our friendly customer service team before starting the operation. Our team is always ready to help you and answer any questions you may have.
>  [Click here to open a new ticket in our Support Page](https://bambulab.com/en/my/support/tickets?from=5).
>  We will do our best to respond promptly and provide you with the assistance you need.

### Print options

_Source: <https://wiki.bambulab.com/en/studio-handy/print-options>_

Printing options can be found as shown below. Before printing, enable one or more options as required, on the screen of the printer or in Bambu Studio. **Please note that these functions vary depending on the model of your printer.**

![print_options_a1_series.png](https://wiki.bambulab.com/software/common/print_options_a1_series.png)

![print_options_en.png](https://wiki.bambulab.com/software/common/print_options_en.png)

#### Enable detection of build plate position

The printer will detect the positioning mark of the build plate. If the mark is not within the predefined area, or if the build plate does not match the one selected in Bambu Studio, the printer will stop printing. This can be useful when you forget to place a build plate or place the wrong type of build plate before printing. Due to the difference in how X1 series and A1 series detects, X1 series can detect a build plate not being placed or a wrong type of build plate, while A1 series can only detect a build plate not being placed.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/quick-start/plate_code.png) | Positioning mark on build plate |
| ![](https://wiki.bambulab.com/software/common/no_plate_en.png) | No build plate placed |
| ![](https://wiki.bambulab.com/software/common/wrong-plate-type-en.png) | Wrong type of build plate |

#### Auto-recovery from step loss

When the motor detects a position shift, which means a lost step, during operation, the X, Y, and Z axes will be homed for positioning. Then, the printer will return to the position prior to the lost step to re-execute the G-code to ensure print quality.

**Note: This function relies on the load detected by the motor. In high-speed movement, the load on the motor is large that the printer may detect a step loss even when there is none. If you are using acceleration close to the limit of the printer, we recommend that you turn off auto-recovery from step loss to avoid false detection.**

> This option can be changed during printing.

#### Sound

The printer produces a sound at power-up, and at the beginning and end of printing.

#### Filament Tangling Monitoring

When the filament is tangled, due to excessive feeding resistance, the corresponding sensor will be triggered, and the printer will automatically pause printing and pop up a reminder of filament entanglement. You can re-arrange the filament on the spool and continue printing, to avoid "printing in the air". For more information on filament tangling monitoring, please refer to [this wiki page](https://wiki.bambulab.com/en/ams-lite/manual/filament-tangle-monitoring-intro).

The printer prints in the air：
 ![](https://wiki.bambulab.com/n1/manual/air-printing-detection/%E7%A9%BA%E6%89%93%E7%A4%BA%E6%84%8F.gif)

#### Enable AI monitoring of printing

After enabling this function, the printer will be able to detect [spaghetti](https://wiki.bambulab.com/en/knowledge-sharing/Spaghetti_detection) and filament buildup in excess chute during printing. The function comes in three sensitivity levels. The higher the sensitivity, the easier the printer detects minor flaws, but the pause time may increase.

> This option can be changed during printing.

- Filament buildup in excess chute

![](https://wiki.bambulab.com/x1/troubleshooting/hmscode/microlidar/470px-92760_spaghetti_pass-error_box.jpg)

- Spaghetti detection

![](https://wiki.bambulab.com/spg_error0.jpg)

#### First Layer Inspection

After finishing printing the first layer, the printer automatically inspects the quality of it. A warning will be provided if anything abnormal happens.
 ![first_layer_inspection_en.png](https://wiki.bambulab.com/software/common/first_layer_inspection_en.png)

#### End Notes

> We hope that the detailed guide we shared with you was helpful and informative.
>
> We want to ensure that you can perform it safely and effectively. If you have any concerns or questions regarding the process described in this article, we encourage you to reach out to our friendly customer service team before starting the operation. Our team is always ready to help you and answer any questions you may have.
>
> [Click here to open a new ticket in our Support Page](https://bambulab.com/en/my/support/tickets?from=5).
>
> We will do our best to respond promptly and provide you with the assistance you need.

### Bambu Studio Multi Plate Printing Guide

_Source: <https://wiki.bambulab.com/en/studio-handy/multi-plate-printing>_

Multi-plate 3D printing is a feature in Bambu Studio that lets you organize a single project across multiple virtual plates instead of placing all parts on a single bed. Each plate functions as a separate print job, making it easier to manage large projects, multi-part assemblies, or multi-color models. This approach improves organization, simplifies reprints, and allows you to apply different print settings to different groups of parts.

#### When Should You Use Multi-plate Printing?

- **3D printing large models that don't fit on one build plate:** You split the parts into sections, and assign each to its own plate.

![](https://wiki.bambulab.com/software/bambu-studio/multi-plate/3d_printed_parts.png)

- **When multi-color or multi-material printing with many parts using a single nozzle 3D printer:** You group parts by color or material on separate plates. This helps reduce purge and print times compared to putting everything on one plate.

![parts_with_different_colors.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/parts_with_different_colors.png)

- **Better organization of prints, especially long prints:** Print high-risk prints in separate plates to prevent one failure from ruining everything. For long prints it helps prevent nozzle knocking which can cause print failure.

#### Applicable 3D Printers

- Bambu Lab H2 Series, P2S, and X1 Series are supported. The P1S is also supported, but you will receive a prompt indicating “Send All Plates” before starting the print. The A1 series is currently not supported.

#### How to Use the Multi-plate Feature

#### Video Tutorial

#### Step by Step Instructions

##### Step 1: Adding a New Plate

Click the **Add Plate** button in the toolbar to add a second plate. You can add multiple plates in the same project, with a maximum of 36 plates supported.

![add_plate_option.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/add_plate_option.png)

The image below shows the arrangement of the models in seven plates.
 ![7_plates_added.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/7_plates_added.png)

##### Step 2: Slicing the Plates

To slice the plates, click the small down arrow, then choose **Slice All** option.

![slicing_all_plates.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/slicing_all_plates.png)

Click **Slice all** again.
 ![slice_all_plates_in_bambu_studio.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/slice_all_plates_in_bambu_studio.png)

You will be able to see the files arranged by plate number, along with printing details such as the estimated filament usage and print time.

![print_details.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/print_details.png)

##### Step 3: 3D Printing the Plates

Click small down arrow on the top-right section, then choose **Print all**.

![print_all_plates.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/print_all_plates.png)

Then, click **Print all** again. Choose your 3D printer then click **Send**.

![send_the_file_for_3d_printing.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/send_the_file_for_3d_printing.png)

##### Step 4: 3D Printing the Subsequent Plates

When the first plate is finished, remove the model from the build plate.

![removing_the_print_from_the_bed.gif](https://wiki.bambulab.com/software/bambu-studio/multi-plate/removing_the_print_from_the_bed.gif)
 Then, clean the build plate and place it back on the heatbed. After confirming the print completion notification, the screen will automatically return to the files page. From there, select your model; it will be the first on the list.

![file_to_print.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/file_to_print.png)

Then, use the left and right arrows to select the next model to print. Click next to proceed.

![scroll_models.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/scroll_models.png)

You can now match the filament, then click **Print** in the top-right corner to begin printing.
 ![3d_print_the_plate.png](https://wiki.bambulab.com/software/bambu-studio/multi-plate/3d_print_the_plate.png)

#### The Print Order of the Plates

When performing multi-plate printing, the printer starts with the most recently added model. As a result, plates are printed in reverse order of how they were added, meaning the first plate added will be printed last. For the example below, the one printed first was added last.
 ![printing_order.gif](https://wiki.bambulab.com/software/bambu-studio/multi-plate/printing_order.gif)

#### Best Practices for Multi-Plate Printing in Bambu Studio

- **Rename plates descriptively for better organization and quick reference:** To rename a plate, right click on it, select **Edit plate name**, then rename it. This is important as it's easier to check previews, troubleshoot failures, and manage complex projects.    ![renaming_the_plate.gif](https://wiki.bambulab.com/software/bambu-studio/multi-plate/renaming_the_plate.gif)
- **Control the print sequence of your plates:** Plates are printed in reverse order by default in Bambu Studio. However, if you prefer a different print sequence, you can plan ahead by adding the plates in the reverse order of how you want them to print. Alternatively, you can manually adjust their position by right-clicking on a plate, selecting **Move**, and choosing the number that will represent its new position.    ![moving_the_plate.gif](https://wiki.bambulab.com/software/bambu-studio/multi-plate/moving_the_plate.gif)
- **Group models by color:** For multi-color parts, organize parts so all pieces using the same color are on one plate. This helps reduce filament changes and overall print time.

#### End Notes

> We hope our guide was helpful. If you have any questions or concerns about the process, please contact our customer service team. We're here to assist you.
>
> [Click here](https://bambulab.com/en/my/support/tickets) to open a new ticket in our Support Page.
>
> We will do our best to respond promptly and provide you with the assistance you need.

### Bambu Studio MacOS frequent operations guide

_Source: <https://wiki.bambulab.com/en/studio-handy/mac-frequent-operations>_

#### Introduction

This page introduces common operations of Bambu Studio on macOS, including going to the preference page, changing language or region, exporting logs on Bambu Studio, switch between different views, and checking the version of Bambu Studio.

#### How to:

##### Change Studio Preferences

1. Click **Bambu Studio**on the top left corner.
2. Click **Settings** to make adjustments to each setting.

![](https://wiki.bambulab.com/20240312170741-convert.gif)

##### Change language or region

1. Click on**Bambu Studio** in the upper left corner and select **Settings**.
2. In **Language**you can select the desired language and in **Login Region** you can switch the region.

![](https://wiki.bambulab.com/3e16aa62-fa7a-4782-8b7d-1357c94ebe70.gif)

##### Export log for troubleshooting

1. Click **Help**in the upper left corner and select **Show Configuration Folder**.
2. Click on the **log**folder and select **Compress 'log'** to export the Studio log.

![](https://wiki.bambulab.com/ac37f761-71a3-403b-a620-19881224a73b.gif)

##### Switch 3D views

- Drag the area other than where the model is located to switch between different model views.
- Click on the **View**in the upper left corner to select the desired view.

![](https://wiki.bambulab.com/831ea1f1-b2a3-41dd-8670-417415a69aea.gif)

##### View the current Studio version

Click **Bambu Studio** in the upper left corner and select **About Bambu Studio**to view the current Studio version.

![](https://wiki.bambulab.com/bdc1f4e2-f345-4614-ae77-64b3264f48f6.gif)

#### *End Notes*

> *We hope the detailed guide provided has been helpful and informative.*
>
> *To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a*[*Technical ticket*](https://bambulab.com/en/my/support/tickets?from=5)*regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.*

### Bambu Studio Filament Package Update

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/filament-package-update>_

#### Introduction

After you have obtained the new filament from Bambu Lab, please follow the steps below to update the filament in Bambu Studio so that you can configure and print with the new filament.

#### How to update the Filament Profile Package?

##### Step 1：Open **Bambu Studio** and click **Prepare**.

![screenshot-20240828-092553.png](https://wiki.bambulab.com/screenshot-20240828-092553.png)

##### Step 2：The instruction will pop up in the lower right corner of the screen, and click **Detail**.

![screenshot-20240828-090911.png](https://wiki.bambulab.com/screenshot-20240828-090911.png)

##### Step 3：Click on the button of *Set filaments to use* on the far right of the **Filament** column.

![20240827-195711.jpg](https://wiki.bambulab.com/20240827-195711.jpg)

##### Step 4：In **System Filaments**, find the new filament (**Bambu Support for ABS** for example) and check the box, then click on **Confirm** in the bottom right corner.

![screenshot-20240828-091410.png](https://wiki.bambulab.com/screenshot-20240828-091410.png)

##### Step 5：The update is complete and the new filament can be selected in the **Filament** selection box.

![screenshot-20240828-091712.png](https://wiki.bambulab.com/screenshot-20240828-091712.png)

#### End Notes

> *We hope that the detailed guide we shared with you was helpful and informative.*
>
> *If you have any concerns or questions regarding the process described in this article, we encourage you to reach out to our friendly customer service team before starting the operation.*
>
> *Our team is always ready to help you and answer any questions you may have.*
>  [*Click here to open a new ticket in our Support Page.*](https://bambulab.com/en/my/support/tickets?from=5)

### Bambu Studio 3mf Compatibility

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/3mf-compatibility>_

#### 1. Introduction

From version 1.8.3, Bambu Studio's 3D model file format (.3mf) is compatible with the 3mf reading code provided by [3MF Consortium](https://github.com/3mfconsortium); Bambu Studio's 3MF files can also be opened in [Microsoft 3D Viewer](https://apps.microsoft.com/detail/9NBLGGH42THS).

This article will introduce the compatibility between Bambu Studio's 3MF file format and the 3MF consortium standards, outlining its features and advantages, and explain why some other slicer can not open the 3mf Bambu Studio generated.

#### 2. Why does Bambu Studio default to 3MF Production Extension specification?

Bambu Studio currently employs the 3MF Production Extension specification from the 3MF Consortium as the default for saving 3MF files. This decision stems from a comprehensive consideration of user experience and future development.

##### 2.1 Relationship Between 3MF Production Extension and 3MF Core Specification

The 3MF Production Extension serves as a supplement to the 3MF Core Specification, introducing new features to effectively support packaging for build platforms and ensure load integrity, particularly in high-production printing environments. The primary focus of this extension is the ability to store model data in files separate from the root model file, allowing the build elements of the root model file to reference these resources.

In summary, a 3mf file adhering to the 3MF Core Specification has only one root file containing all model data. When parsing the 3mf file, it retrieves from this root model file, and only one model file can be read. On the other hand, a 3mf file following the 3MF Production Extension Specification not only has a root file but also stores the actual model data in different files. When parsing the 3mf file, it uses the index in the root model file to locate other files containing model data. This enables the simultaneous reading of multiple model files, achieving parallel processing of model data.

##### 2.2 Bambu Studio File Reading Speed Test

By adopting the [3MF Production Extension](https://github.com/3MFConsortium/spec_production/blob/1.1.2/3MF%20Production%20Extension.md) specification, Bambu Studio achieves parallel processing during the loading and saving of model data, significantly enhancing operational efficiency. The features of this specification empower our users to rapidly handle large-scale 3D models and multi plates, whether during the design phase or when opening and saving 3D models.

Below are two 3MF files of the same data model. The right one uses the 3MF Production Extension specification (named Muti-part-Production.3mf) and the left one does not (named Muti-part-Core.3mf). Opening them separately in Bambu Studio shows the loading speed of right example being much faster than left.
 ![bambu_speed_of_opening_3mf.gif](https://wiki.bambulab.com/general/3mf_compatibility/bambu_speed_of_opening_3mf.gif)

#### 3. 3MF Consortium Reading Test

The ability to successfully retrieve 3D models from the files is a critical criterion for the usability of 3MF files. An example of reading 3mf reads file is included in the lib3mf library of the 3mf Consortium. Therefore, employing Bambu Studio as the producer of 3mf file and the [lib3mf](https://github.com/3MFConsortium/lib3mf/releases/tag/v2.2.0) as the consumer to read, a reading test is conducted.
 The 3MF files saved by Bambu Studio can be successfully read, retrieving model data without issues.

Below is a [3mf file](https://makerworld.com/zh/models/13716#profileId-14573) from MakerWorld, where after downloading, opening and saving through Bambu Studio v1.8.3, the data can be successfully read by lib3mf.
 The following example contains the main model data:
 ![part_of_read_test_result.jpg](https://wiki.bambulab.com/general/3mf_compatibility/part_of_read_test_result.jpg)

#### 4. The Microsoft 3D Viewer is now able to open the 3mf files generated by Bambu Studio.

From version 1.8.3, 3MF files produced by Bambu Studio can be successfully opened in the [3D Viewer](https://apps.microsoft.com/detail/9NBLGGH42THS).
 The following gif is a [MakerWorld 3mf](https://makerworld.com/zh/models/13716#profileId-14573) file saved by Bambu Studio, which can be opened by the 3D Viewer.
 ![can_open_bambu_3mf.gif](https://wiki.bambulab.com/general/3mf_compatibility/can_open_bambu_3mf.gif)

We would like to issue a special notice regarding a particular situation. It has come to our attention that including certain Chinese punctuation marks in the 3D model description file of a 3MF file may result in the 3D Viewer being unable to open the file successfully.
 This issue is not limited to 3MF files compliant with the [3MF Production Extension](https://github.com/3MFConsortium/spec_production/blob/1.1.2/3MF%20Production%20Extension.md) but also applies to those adhering to the [3MF Core Specification](https://github.com/3MFConsortium/spec_core/blob/1.2.3/3MF%20Core%20Specification.md).

In addition, certain software and slicers don't support the [3MF Production Extension](https://github.com/3MFConsortium/spec_production/blob/1.1.2/3MF%20Production%20Extension.md) specification. This results in the inability of these tools to open 3mf files produced by Bambu Studio.
 In the case of PrusaSlicer and Cura, which are widely used in 3D printing, we have submitted pull requests on GitHub to enable support for the 3MF Production Extension specification.

However, we have not received any feedback as of now.
 [https://github.com/prusa3d/PrusaSlicer/pull/10808](https://github.com/prusa3d/PrusaSlicer/pull/10808),
 [https://github.com/Ultimaker/Cura/pull/15761](https://github.com/Ultimaker/Cura/pull/15761).

Update: PrusaSlicer merged the patch on March 21, 2024.

#### 5. Wrapping up

We deeply understand the critical importance of file compatibility for user's work and creative endeavors. In light of this, we consistently strive for improvement and optimization, aiming to align with standards, and actively engage in communication with the community and relevant organizations.

Throughout this process, we appreciate your understanding and patience. Should you have any questions, please feel free to reach out to us; we are ready to provide support at any time.

Thank you for your understanding and support of Bambu Studio!

### Introduction to the printable range of H2D dual nozzles

_Source: <https://wiki.bambulab.com/en/h2/manual/printable-range-for-dual-nozzles>_

#### Background

The H2D is a two-nozzle printer, and the printable range of the printer's two nozzles is different. This article will describe the limits of the printable area of the H2D printer and some considerations.

| **Dual nozzle switching** | **Only the left nozzle can reach the leftmost side of the heatbed** | **Only the right nozzle can reach the rightmost side of the heatbed** |
| --- | --- | --- |
| ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/%E5%8F%8C%E5%96%B7%E5%98%B4%E5%88%87%E6%8D%A2.gif) | ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/am405161.jpg) | ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/am405167.jpg) |

#### Printable area limit

##### **Horizontal printable area**

For H2D printers, the full print area in horizontal direction is "325x320".

- Left nozzle only: printable area coordinates (0,0) to (325,320)
- Right nozzle only: printable area coordinates (25,0) to (350,320)

On the Bambu Studio build plate preview, markings on the left and right sides indicate "left nozzle only area" and "right nozzle only area." This means that when the model is placed in this area, only the left or right nozzle can be used for printing. The middle area is the common printing area of the left and right nozzles, as shown in the figures below.

| ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/h2d_full_printable_area.jpg) | ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/h2d_left_nozzle_printable_area.jpg) |
| --- | --- |
| The full print area of the printer | Printable area of the left nozzle |

| ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/h2d_right_nozzle_printable_area.jpg) | ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/h2d_common_nozzle_printable_area.jpg) |
| --- | --- |
| Printable area of the right nozzle | Common print area for left and right nozzles |

- Left nozzle: The maximum printable area in the horizontal direction is 325x320mm; the maximum printable height is 320mm; the maximum printable volume is 325x320x320mm;
- Right nozzle: The maximum printable area in the horizontal direction is 325x320mm; the maximum printable height is 325mm; the maximum printable volume is 325x320x325mm;
- Common print area for left and right nozzles: 300x320mm; the maximum printable height is 320mm; the maximum printable volume is 300x320x320mm;
- Printer: The maximum printable area in the horizontal direction is 325x320mm; the maximum printable height is 325mm; the maximum printable volume is 325x320x325mm.

##### **Vertical printable height**

The maximum printable height of the left nozzle is 320mm, and the maximum printable height of the right nozzle is 325mm, so 325mm is also the maximum height that the printer can print.**When the object is placed within the left-nozzle-only area, its maximum printable height will be slightly lower than the maximum printable height of the printer.** Note that if the model height exceeds the printable height of the left nozzle (e.g. 324mm), then the model can only be printed with the right nozzle, even if it is placed in the middle area.

| ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-5.png) | ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-9.png) |
| --- | --- |
| Maximum printable height of left nozzle | Maximum printable height of right nozzle |

#### Printable range detection and common error scenarios

When an object is placed in the non-printable area of the left/right nozzle, the sliced filament used by the object can only be printed using nozzles that meet the printing range. **The filaments used by this object include: its default filament, the filament used for painting, the filament used for modifiers, and the filament used for height range modifiers.**

For example, the cube in the following figure only has one surface painted. From the model surface, this painted surface is the common printing area of the left and right nozzles, but after slicing, due to the embedding of the multi-color area, the print route appears in the left-nozzle-only area. In this case, the default filament of the object, as well as the filament used for painting, can only be printed with the left nozzle.

| ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/image-6.png) | ![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-3.png) |
| --- | --- |

If Bambu Studio detects that the model's placement conflicts with the printable area, or that there may be a conflict, a tip will pop up. **Tips are classified into warning tips and error tips. If a warning is displayed, you can continue to slice and send print task, but you may need to adjust the model's placement or the filament. If you get an error message, you cannot slice this plate.** The specific detection process is as follows:

##### Inspection before slicing

###### Horizontal printable area inspection

(1) Auto grouping: (the filament grouping is unknown before slicing, so which nozzle the filament is grouped into has not yet been determined. The auto grouping has two modes: filament-saving mode and convenient mode. For details, please refer to the Wiki:[Introduction to Filament Grouping Strategy for Dual Nozzle Printers](https://wiki.bambulab.com/zh/software/bambu-studio/manual/dual-nozzles-slicing-filament-grouping)

Error: When the same filament appears in both left/right nozzle-only areas, the slicer will give an error message, as shown below.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-6.png)

（2）Custom grouping: (the filament groups have been manually set before slicing. After determining the filament grouping, it can be clearly judged whether the model is placed within the printable range.)

Error: When the model is placed in the non-printable area of the nozzle of the filament group, the slicer will give an error message. For example, in the figure below, the cube is placed in the left nozzle-only area, but the red filament is manually grouped to the right nozzle, and the slicer will directly display an error message.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image.png)

###### Vertical printable area inspection

As described above, the printable height of the left nozzle is 320mm, and the printable height of the right nozzle is 325mm.

(1) Auto grouping：

Error: If the model exceeds the maximum printable height of the printer (325mm), both nozzles cannot print and the slicer will give an error message.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-1.png)

（2）Custom grouping：

Error: When the model height exceeds the maximum printable height of the left nozzle (320mm) but is lower than the maximum printable height of the right nozzle (325mm), and the filament is manually grouped into the left nozzle, an error message will appear. Suggest appropriately grouping the filament into the right nozzle or adjusting the model height.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-2.png)

Error: If the model exceeds the maximum printable height of the printer (325mm), both nozzles cannot print and the slicer will give an error message.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-14.png)

##### Gcode check after slicing

Some scenarios require slicing before it can confirm whether the Gcode path conflicts with the printable range, such as when an object needs to generate support or when flushing to infill/object/support is enabled for a certain object. After slicing, the final nozzle grouping of each filament is determined, and the GCode will be checked to see if it extends beyond the printable area of the nozzle group where the material is located.

As shown below, the red and blue cubes are placed in the left-nozzle-only and right-nozzle-only areas. After slicing, the two filaments are also grouped to the left and right nozzles (using the filament-saving mode). Enabling "Flush into objects' infill" for the red cube in the object list will allow some flushing blue filament to be printed in the red cube's infill, while the blue filament can only be printed with the right nozzle. Therefore, the Gcode path of the blue filaments exceeds the printable area of the right nozzle, and an error message will appear in the lower right corner.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-16.png)

##### Common error scenarios

To sum up, the common errors caused by objects beyond the printable range are as follows:

1. The default material of the object is in an unprintable area.

For example, the default filament for an object is the filament from the right nozzle, but the Gcode path for the model appears where the right nozzle cannot print.

1. For the painted object, the embedded part of the painted area appears in the non-printable area of a certain nozzle.

As shown below, from the appearance, the green part is not located in the non-printable area of the right nozzle. However, looking at the inner layer after slicing, it can be found that due to the embedding of the multicolor area, the Gcode of the green material appears in the non-printable area of the right nozzle.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-12.png)

1. "Flush to support or infill" is enabled, causing the Gcode path to exceed the printable area of a certain nozzle.

As shown in the figure below, filament 1 is grouped to the left nozzle, filament 2 is grouped to the right nozzle, and filament 1 and filament 2 are located in the printable area of the left and right nozzle respectively. It seems the setting is reasonable, but the error message in the lower right corner shows that the filament 2 Gcode path exceeds the printable area of the right nozzle. This is because we enabled "Flush into objects' infill" in the object list, resulting in the infill of the left cube being printed using filament 2. So there is a conflict between filament 2 (print by right nozzle) and the printable area.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-13.png)

1. The filament used for support is located in the non-printable area.

After slicing, if the object has generated support, check whether the filament used for the support and support interface exceeds the printable range of the nozzle. As shown below, the Gcode path for the support filament used by the support interface is partly located in the left-nozzle-only area, resulting in an error message.

![](https://wiki.bambulab.com/h2/manual/dual-nozzles-range/en1/image-15.png)

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> If this guide does not solve your problem, *please submit a [technical ticket](https://bambulab.com/en/my/support/tickets/create?from=5)*, we will answer your questions and provide assistance.
>  If you have any suggestions or feedback on this Wiki, please leave a message in the comment area. Thank you for your support and attention!

### Introduction to Filament Grouping Strategy for Dual Nozzle Printers

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/manual/dual-nozzles-slicing-filament-grouping>_

#### 1. Background

When switching between different filaments for printing on a single nozzle (hotend) printer, it is necessary to use a certain amount of new material to flush the residual material in the hotend, to avoid color mixing during printing. The flushing values vary between different materials, and the specific values can be viewed on the filament page of Bambu Studio. You can refer to the wiki to learn more: [Reduce Waste during Filament Change](https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change)

For a dual-nozzle (hotend) printer like the H2D, the optimal way to print two filaments is to print different filaments with different nozzles. In this case, switching between filaments only requires switching the nozzles rather than flushing the old filament with the new one. Switching nozzle printing can also reduce the number of filament flushes when printing more than two filaments. This article will introduce filament grouping strategies for dual-nozzle printers to achieve the most efficient or convenient multi-material printing method.

#### 2. Multi-color printing sequence

Different printing sequences have different filament switching sequences, resulting in differences in the flushing volume. The slicer will calculate an optimal printing sequence based on the flushing volume between the filaments, to minimize the waste amount. For example, if the total flushing amount of filament sequence 1->2->3 is greater than that of 1->3->2, the latter will tend to be used as the printing sequence for this layer. For detailed information on manually adjusting print sequences, please refer to: [Set the filament printing sequence for different layers](https://wiki.bambulab.com/en/software/bambu-studio/parameter/filament-sequence-for-different-layers)

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-8.png)

![The flushing amount obtained through the automatic allocation of the printing sequence](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-9.png)

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-7.png)

![The flushing amount obtained through the manual setting of the printing sequence](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-10.png)

#### 3. Grouping restrictions on filaments

Due to the physical limitations of the printer, different nozzles have their own printable area limits ([Introduction to the printable range of H2D dual nozzles](https://wiki.bambulab.com/en/h2/manual/printable-range-for-dual-nozzles)). As shown in the figure below, when the part of the model printed with a filament is placed in the left nozzle or right nozzle only area, then it can only be printed using the corresponding nozzle.

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-6.png)

In addition, based on the physical design of the toolhead and the characteristics of the material, each nozzle has other printable filament limitations, with specific limitations as follows

**Group restrictions:**

- The H2D can print TPU filament with either nozzle, but note that when the left nozzle prints TPU, the right nozzle cannot be used. During nozzle changes, the up-and-down movement of the left nozzle will twist the TPU filament. When the right nozzle prints TPU, the left nozzle can print hard filament. The H2C currently does not support TPU printing with the left nozzle. (Priority: High)
- PPA-CF and PPS-CF materials can only be printed with the left nozzle. (Priority: High)
- When the height of the part exceeds 320 mm, it should be placed in the printable area of the right nozzle. (Priority: Medium)
- When parts are placed in the left-nozzle-only or right-nozzle-only area, they must be grouped to the corresponding nozzle for printing. (Priority: Medium)
- Filament can be printed with both left and right nozzles, it's recommended to print with the right nozzle. (Priority: Low)

#### 4. Filament-saving mode

Since material switching between different nozzles does not require flushing, the entire flushing amount comes from switching filaments from the same nozzle.**To reduce filament waste during switching, the filaments with a large switching volume should be assigned to separate nozzles.**The default material grouping strategy used in Bambu Studio is the filament-saving mode. You can see a total of 3 modes in the floating window of the slicing button. Select "Filament-Saving Mode" and click on slicing to obtain the most filament-saving printing. The logic of this strategy is briefly introduced in the following sections.

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-5.png)

When you set the pairing relationship between AMS and the left and right nozzles, and synchronize the AMS information in Bambu Studio, the slicer can calculate how many filaments are connected to each nozzle. If no AMS is connected to the printer, the slicer defaults to allowing the nozzle to load one filament through the external spool. Then the slicer can achieve an optimal filament grouping to ensure minimum flushing waste is attained under the calculated printing sequence. The principle is to group the filaments with more common layers and larger flushing amounts into as many different nozzle groups as possible.

To sum up, the grouping algorithm mainly needs to consider the following points, and the priority of each point is reduced in order.

1. Whether the material is a non-printable filament for the nozzle;
2. The upper limit of filament in AMS connected to the nozzle;
3. Minimize the filament flushing amount;
4. Minimize the color gap (Delta E) to the filament in the AMS connected to the nozzle;

**Since the grouping logic is more inclined to reduce the flushing amount rather than the closest color, after slicing, the user needs to check whether the filaments are placed in the corresponding AMS of the left and right nozzles according to the "Filament Grouping", and appropriately adjust the position of each filament in the AMS. Otherwise, the filament automatically assigned to the nozzle may not be selected in the sending task window.**

As shown in the following GIF, **once the sliced filament is assigned to a specific nozzle, it cannot be forcibly changed to a filament from another nozzle when sending the task. Even if there is a filament of a closer color from the other nozzle.** So we can only manually adjust the position of filaments in AMS to achieve the most filament-saving printing.

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/1.gif)

#### 5. Convenience mode

Unlike the filament-saving mode, the convenience mode groups filaments entirely according to the filaments placed in the AMS, regardless of the sliced model. Under this strategy, efforts will be made to match the filament grouping results as closely as possible with the filaments placed in AMS (color, type, etc.).

This option tends to group based on the user's existing filament placement, **which may waste more filaments for flushing, and in most cases, there is no need to adjust the position of the filaments separately. Suitable for scenarios where users are not near the printer and remotely initiate multi-material printing tasks.** We suggest that you resynchronize the AMS filament information before using this mode for slicing. You can select "Convenience Mode" in the floating window of the slicing button, and the sliced filaments will be grouped according to the actual filaments placed in your AMS. After slicing, it can be seen that the optimal grouping (filament-saving mode) saves more filament amount compared to the convenience mode.

The grouping algorithm under this strategy mainly considers the following points, with the priority of each point decreasing in order:

1. Whether the material is a non-printable filament for the nozzle;
2. Consistency between sliced filaments and filament material types in AMS;

1. Minimize the color gap (Delta E) to the filament in the AMS connected to the nozzle;

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/2.gif)

#### 6. Quality mode (X2D)

**X2D Quality Mode** is a new print mode added alongside the existing Filament-Saving, Convenience, and Custom modes. It prioritizes overall print quality, ensuring optimal dimensional accuracy and surface finish.

If you manually assign a support filament in the support settings, the printer automatically applies a nozzle-split strategy: the right auxiliary nozzle prints only the support filament, while the left nozzle handles the main filament, further enhancing print quality.

| ![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/en-support-filament.jpg) | ![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/en-quality-mode.jpg) |
| --- | --- |

#### 7. Custom mode

Suppose you are not satisfied with the auto filament grouping strategy. In that case, you can click on "Regroup filament" in "Filament Grouping", and then manually adjust the filaments in the left and right nozzles in "Custom". After slicing again, you can see that the optimal grouping (most filament-saving) method saves more filaments than manual grouping. **Note: Filament-saving strategy only considers saving filaments, so sometimes there may be more filament changes in filament-saving mode than in convenience or manual mode, which is normal.**

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/3.gif)

You can also directly select "Custom Mode" in the floating window of the slicing button, which will allow you to customize the group of slicing filaments to the left and right nozzles before slicing.

| ![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-4.png) | ![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-3.png) |
| --- | --- |

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/4.gif)

#### 7. Singe Plate and Multi-Plate settings

**Single Plate Settings**

- In the single plate slicing interface, in addition to the floating window settings, a grouping icon is located on the right side of each printing plate.
- Clicking the icon will pop up a filament group window, where you can set the filament grouping scheme for the current plate
  - Automatic Mode: Includes filament-saving mode and convenience mode
  - Custom Mode: Supports manual grouping of filament

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-2.png)

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image-1.png)

**Multi-Plate Settings**

- During multi-plate slicing, the grouping strategy set in the floating window will be uniformly applied to all printing plates, overriding their individual settings.
- To configure grouping strategies separately for each printing plate, please switch to the single plate slicing mode for operation.

![](https://wiki.bambulab.com/h2/manual/deal-nozzles-filament-grouping/image.png)

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> If this guide does not solve your problem, *please submit a [technical ticket](https://bambulab.com/en/my/support/tickets/create?from=5)*, we will answer your questions and provide assistance.
>  If you have any suggestions or feedback on this Wiki, please leave a message in the comment area. Thank you for your support and attention!


## Toolbar

### Bambu Studio Toolbar (Top Toolbar & Right-click Tools)

_Source: <https://wiki.bambulab.com/en/bambu-studio/skills>_

This page introduces the "Top toolbar" and "Right-click tool" in Bambu Studio Slicer.

![](https://wiki.bambulab.com/bambu-studio/toolbar1.jpg)

#### Top toolbar

- [Plates Management](https://wiki.bambulab.com/en/software/bambu-studio/plates_management)
- [Auto Arranging](https://wiki.bambulab.com/en/software/bambu-studio/auto-arranging)
- [Auto Orientation](https://wiki.bambulab.com/en/software/bambu-studio/auto-orientation)
- [Split to Objects/Parts](https://wiki.bambulab.com/en/software/bambu-studio/split-to-objects-parts)
- [Variable Layer Height](https://wiki.bambulab.com/en/software/bambu-studio/adaptive-layer-height)
- [Move Tool](https://wiki.bambulab.com/en/bambu-studio/skills/move)
- [Lay on Face](https://wiki.bambulab.com/en/software/bambu-studio/lay-on-face)
- [Cut Tool](https://wiki.bambulab.com/en/software/bambu-studio/cut-tool)
- [Mesh boolean](https://wiki.bambulab.com/en/software/bambu-studio/mesh-boolean)
- [Support Painting Guide](https://wiki.bambulab.com/en/software/bambu-studio/support-painting)
- [Seam](https://wiki.bambulab.com/en/software/bambu-studio/Seam)
- [Text Shape](https://wiki.bambulab.com/en/software/bambu-studio/3d-text)
- [Color Painting Tool](https://wiki.bambulab.com/en/software/bambu-studio/color-painting-tool)
- [Measurement Tool](https://wiki.bambulab.com/en/software/bambu-studio/measurement_tool)
- [Assembly Tool](https://wiki.bambulab.com/en/software/bambu-studio/assemble)
- [Assembly View Guide](https://wiki.bambulab.com/en/software/bambu-studio/assembly-view-guide)
- [Brim ear](https://wiki.bambulab.com/en/software/bambu-studio/brim-ears)

#### Right-click tool

- [Fix Model](https://wiki.bambulab.com/en/software/bambu-studio/fix-model)
- [Simplify Model](https://wiki.bambulab.com/en/software/bambu-studio/simplify-model)
- [Negative Part](https://wiki.bambulab.com/en/software/bambu-studio/subtract-a-part)
- [Modifier](https://wiki.bambulab.com/en/software/bambu-studio/modifier)
- [Stacking Models](https://wiki.bambulab.com/en/software/bambu-studio/stacking-objects)
- [Tips for using discs to preventing warping](https://wiki.bambulab.com/en/software/bambu-studio/use-disc-to-avoid-warping)


## Print Settings

### Setting Guide of Slicing Parameters

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/how-to-set-slicing-parameters>_

#### Slicing Parameters

Bambu Studio has hundreds of slicing parameters, which are used to adjust the behavior of the slicer process to produce desired printing effects. These parameters are divided into three categories: **printer**, **filament** and **process**.

In a category, once values for all parameters have been set, it can be saved as a parameter preset. For example, we can set all parameter values from `printer` category according to Bambu Lab X1 and save it as a `printer` preset named "Bambu Lab X1 0.4 nozzle".
 For ease of use, Bambu Studio provides some built-in presets for each category. Most of the time, you can easily select presets according to your requirements to meet basic slicing needs.

##### Printer Presets

The printer preset contains all of the printer hardware settings, such as the maximum print speed of each axis, limitations of the print area, and the nozzle's diameter.
 ![](https://wiki.bambulab.com/software/bambu-studio/preset/printer_preset_x1c.png)

Before slicing, you need to select the correct printer preset according to your machine.
 ![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.25.png)

##### Filament presets

Filament presets contain all of the filament-specific settings, such as print temperature, hotbed temperature, and flow ratio.
 ![](https://wiki.bambulab.com/software/bambu-studio/preset/filament_preset_pla.png)

Before slicing, users need to select the correct filament to print their model.
 ![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.23.png)

##### Process presets

The process preset contains all the settings for a specific print job such as layer height, support details, and extrusion width.
 ![](https://wiki.bambulab.com/software/bambu-studio/preset/process_preset.png)

The figure below shows how to choose a process preset.
 ![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.24.png)

##### Create your own preset

Bambu Studio supports custom presets (printer, filament, or process presets). This is especially useful when you have special requirements. For example, you may create a process preset that increases the overall strengh of a model by increasing infill density, wall number and top/bottom shell number. Or you may create a filament preset for a 3rd party filament whose filament presets are not built into Bambu Studio.

[Parameter Preset](https://wiki.bambulab.com/en/software/bambu-studio/preset) introduces how to create your own preset in detail.

#### Set Slicing Parameters

##### Set Printer or Filament parameters

You can set parameters according to the following pictures
 ![](https://wiki.bambulab.com/software/bambu-studio/setting-guide-of-slicing-parameters/set_printer_parameters_new.jpg)

![](https://wiki.bambulab.com/software/bambu-studio/setting-guide-of-slicing-parameters/set_filament_parameters.png)

##### Set Process parameters

For parameters in the process category, Bambu Studio supports setting values in several fields of reference or levels:

- **Global**    A parameter that is set in global level takes effect for each object in the project.
- **Object**    A parameter that is set in the object level takes effect for all parts in the currently selected object.
- **Part**    A parameter that is set in part level takes effect for the currently selected part.
- **Modifier**    A modifier is a special part of an object. It is designed to change parameters for object regions that are intersected with the modifier part.

Usually, if the same parameter is set in multiple levels at different values, the value from the smallest level will be used, as described in the below picture.

![](https://wiki.bambulab.com/software/bambu-studio/hierarchical-parameters/hie-7.png)

##### Global Level Parameters

Global parameter values will be applied to all objects in the project. For instance, sparse infill density is set to 5% in the global parameters below, so all objects will have a 5% infill density.
 Therefore, it is **highly recommended** to set global parameters to be suitable for most objects.

![](https://wiki.bambulab.com/software/bambu-studio/hierarchical-parameters/figure1.jpg)

Note: Parameter presets are global. Only global parameter modifications can be saved to a (user or project) preset.

##### Object Level Parameters

For an object that requires special parameter settings, we need to set its values in the object field of reference.

First, we change the process setting mode from “Global” to “Object” and then set our cone's infill density to 20%. After slicing, the infill density of the cone becomes 20%, and that of other models remains at 5% (the global value). Parameters set at the object level override those at the global level.

![](https://wiki.bambulab.com/software/bambu-studio/hierarchical-parameters/hie-5.png)

*TIP: Bambu Studio supports selecting multiple objects and setting their parameter values together.*

##### Part Level Parameters

If you want to use different parameter values among different parts of an object, you can select a part in the object list and change its parameter values.

Take the object in the following figure as an example. If we set the object's filament to #1(blue), and set the part named squirtle_dule_detail.STL to #2(orange), the squirtle_dule_detail.STL will be printed with filament #2. Parameters set at the part level override those at the object or global levels.

![](https://wiki.bambulab.com/software/bambu-studio/hierarchical-parameters/hie-6.png)

*TIP: Bambu Studio Supports selecting multiple parts from the same object, and setting their parameter values together.*

##### Modifiers

The modifier is a special part of an object, not an object to be printed. As it's name suggests, it is designed to modify the settings where it overlaps with an object. Parameters set via modifiers override those set at part, object, or global levels.

To create a modifier, right-click on an object, choose "Add Modifier" in the context menu and then select the modifier shape that you want.

The following gif shows an example.
 ![](https://wiki.bambulab.com/software/bambu-studio/hierarchical-parameters/modifier15.gif)

### How to Create Custom Preset

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/preset>_

Before introducing how to create your own preset, we need to explain what the system preset is.

#### System preset

System presets are built-in presets provided by Bambu Studio for each supported printer. When a printer is selected, a *configuration bundle* is imported with the process, filament, and printer presets for that printer.

System presets cannot be modified directly. However, you can make copies of system presets, modify any settings you like, and save the result as a user preset.

|  |  |  |
| --- | --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.6.png) | ![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.23.png) | ![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.24.png) |

Notes:
The presets for the process parameters will change as you select different nozzle diameters for your printer. For example, when you select "Bambu Lab X1C 0.4 nozzle", you will see the process parameters like this:

![x1c-0.4-parameter.png](https://wiki.bambulab.com/software/bambu-studio/preset/x1c-0.4-parameter.png)

When you switch to "Bambu Lab X1C 0.2 nozzle", you will see the process parameters like this:

![x1c-0.2-parameter.png](https://wiki.bambulab.com/software/bambu-studio/preset/x1c-0.2-parameter.png)

#### User preset

Although the system modifier is enough in most printings, you could also create a user preset to optimize the most commonly used model types. For example, if most of your model has strict requirements on strength, you can create a preset that increases the wall count, infill density, and shell layers and selects a honeycomb infill pattern. Another typical example is creating new filament presets for 3rd party filaments.

To create a user preset, you may first choose a system preset as the base. After modifying parameters accordingly, please click the “Save” icon, name the new preset, and select “User Preset” type in the pop-up dialog. NOTE: It is not recommended that beginner users change the parameters randomly. You can make user presets for the printer, the filament, and the process, as saved below:

##### Printer User Preset

![printer_user_preset.png](https://wiki.bambulab.com/software/bambu-studio/preset/printer_user_preset.png)

##### Filament User Preset

![filament_user_preset.png](https://wiki.bambulab.com/software/bambu-studio/preset/filament_user_preset.png)

##### Process User Preset

![process_user_preset.png](https://wiki.bambulab.com/software/bambu-studio/preset/process_user_preset.png)

The newly created user preset will ( Please enable the preset feature in Preferences ) be uploaded to Bambu Cloud and it belongs to the currently logged-in account.

![preference_preset.png](https://wiki.bambulab.com/software/bambu-studio/preset/preference_preset.png)

In addition, user preset data can be automatically downloaded from Bambu Cloud every time you log into Bambu Studio.

![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.22.png)

> *Note: Due to limited cloud resources, presets for non-Bambu Lab printers are currently not supported for cloud synchronization.*

#### Project preset

You can also save the modified parameters as a project preset. The project preset is just saved in the current project file (.3mf). The project preset is only visible when this project is loaded in Bambu Studio and will disappear after loading another project. Unlike the user preset, it has nothing to do with any user account and will not be uploaded to Bambu Cloud.

![](https://wiki.bambulab.com/software/bambu-studio/preset/fig.10.png)

#### Export & Import preset

If you want to share settings with others or create a backup of your custom settings, you can export the selected preset to a local folder.

##### Export Preset

Bambu Studio allows exporting the user preset. The gif below shows how to export a user preset file.

![](https://wiki.bambulab.com/software/bambu-studio/preset/export.gif)

##### Import Preset

Bambu Studio allows importing of the user preset. The figure below shows how to import a user preset file.

![](https://wiki.bambulab.com/software/bambu-studio/preset/import.gif)

#### Delete Preset

After successfully creating a new preset, you can notice a × icon to the right of the Save Preset button. Click on this icon to delete the preset.

Below is an example of a Filament User Preset:

![](https://wiki.bambulab.com/software/bambu-studio/preset/delete.png)

### Auto Cooling in Filament Settings

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/auto-cooling>_

Cooling is crucial for the print quality of FDM printers, especially when the model features small details such as overhangs, bridges, or sharp tips. Below are examples of models where the print quality suffered due to insufficient cooling at high printing speeds.

![bambustudio_cooling_image.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_image.png)
 Cooling-related settings can be managed on the **Filament Settings** page, as shown below. These settings control the cooling fan speeds and limit the printing speed for individual layers.

![bambustudio_cooling_introduction.jpg](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_introduction.jpg)

Some parameters are complex, so please refer to the details below for a comprehensive explanation.

#### Cooling for Specific Layer

##### Special Cooling Settings

This setting is used to adjust the auxiliary part cooling fan speed for the first *n* layers. During these first *n* layers, a specified auxiliary fan speed is applied uniformly, while the part cooling fan remains disabled.

If this special cooling setting is not enabled, the part cooling fan and the auxiliary part cooling fan will operate according to their respective standard parameters.

> **Note:** Typically, to improve adhesion between the first layer and the build plate, both cooling fans are disabled by default for the first layer (fan speed set to 0).

![bambustudio_cooling_special_cooling_settings.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_special_cooling_settings.png)

#### Part Cooling Fan

##### Min / Max Fan Speed Threshold

The part cooling fan speed automatically adjusts based on the print time of each layer, controlled by two speed thresholds and their corresponding layer time thresholds.

For example:

- **Min Fan Speed Threshold** is 10% for a Layer Time of 30s.
- **Max Fan Speed Threshold** is 80% for a Layer Time of 3s.

The corresponding relationships between layer print time and fan speed are as follows:

- When a single layer takes **30 seconds or more** to print, the fan speed drops to 10%.
- When a single layer takes **3 seconds or less** to print, the fan speed rises to 80%.
- If the actual print time is **between 3 and 30 seconds**, the fan speed is determined by linear interpolation between these two thresholds (varying between 10% and 80%).

![bambustudio_cooling_fan_speed_threshold.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_fan_speed_threshold.png)

Refer to the chart below for actual fan speeds relative to single-layer print time. The fan will turn off if the time exceeds the layer time threshold.

![bambustudio_cooling_linechart1.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_linechart1.png)

##### Keep Fan Always On

If enabled, the part cooling fan will never stop. It will run at least at the minimum speed defined in the "Min Fan Speed Threshold" to reduce the frequency of starting and stopping.

![bambustudio_cooling_keep_fan_always_on.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_keep_fan_always_on.png)

As shown below, the fan will maintain at least the minimum speed.
 ![bambustudio_cooling_linechart2.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_linechart2.png)

##### Slow Printing Down for Better Layer Cooling

If the fan speed has already reached the maximum threshold but the single-layer print time is still shorter than the "Layer Time" set in the **Max Fan Speed Threshold**, cooling may still be insufficient.

To improve this, you can enable **"Slow Printing Down for Better Layer Cooling"**. This function automatically reduces printing speed to ensure the single-layer print time is no less than the target time (defined in the Max Fan Speed Threshold), thereby extending the cooling time for each layer. This is particularly effective for sharp spires, small details, and other areas requiring ample cooling.

> **Note:** Once the printing speed is reduced to the **"Min Print Speed"**, if the single-layer print time still has not reached the minimum layer time threshold, the printer will maintain the minimum print speed and will not slow down further.
>
> **As shown below:** If the layer time is less than 4 seconds, the system attempts to slow down to ensure at least 4 seconds of print time. However, if the speed drops to 20 mm/s and the time is still under 4 seconds, it will continue printing at 20 mm/s rather than slowing down further.

![bambustudio_cooling_slow_printing_down.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_slow_printing_down.png)

- *Left image: "Slow Printing Down for Better Layer Cooling" Enabled.*
- *Right image: Disabled.*

![bambustudio_cooling_speed_reduction_comparison.jpg](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_speed_reduction_comparison.jpg)

##### Don't Slow Down Outer Walls

When enabled, the outer wall printing speed will not be reduced to satisfy the minimum layer time, ensuring outer wall quality. This is particularly useful in the following cases:

- **Printing with Glossy/Silk Filament:** Prevents differences in glossiness caused by speed variations.
- **Surface Consistency:** Keeps outer walls uniform, preventing minor defects similar to Z-banding or striping.
- **Defect Avoidance:** Avoids subtle artifacts on the outer wall caused by fluctuating speeds.

![bambustudio_cooling_don't_slow_down_outer_walls.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_don't_slow_down_outer_walls.png)

- *Left image: "Don't slow down outer walls" Enabled.*
- *Right image: Disabled.*

![bambustudio_cooling_exterior_wall_speed_comparison.jpg](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_exterior_wall_speed_comparison.jpg)

##### Min Print Speed

This is the lowest speed to which the printer will drop when the "Slow Printing Down for Better Layer Cooling" function is active.

![bambustudio_cooling_min_print_speed.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_min_print_speed.png)

##### Force Cooling for Overhangs and Bridges

When enabled, the fan speed for overhang and bridge areas is no longer limited by the layer time rules mentioned above. When the overhang angle exceeds the threshold, you can set a higher fan speed specifically for these suspended areas to enhance local cooling.

> **Note:** Unless you have a specific reason to change it, please keep this enabled by default.

![bambustudio_cooling_force_cooling_for_overhangs.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_force_cooling_for_overhangs.png)

##### Cooling Overhang Threshold

When the overhang degree of a print exceeds this threshold, the cooling fan is forced to ramp up to a specific speed. This value is expressed as a percentage, representing the proportion of the extrusion line width that is unsupported by the layer below. (For overhang calculations, refer to the Wiki:[Slow Down for Overhangs](https://wiki.bambulab.com/en/software/bambu-studio/slow-down-for-overhang))

When set to **0%**, it means all outer walls will be forcibly cooled regardless of the overhang degree.

![bambustudio_cooling_cooling_overhang_threshold.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_cooling_overhang_threshold.png)

##### Overhang Threshold for Participating Cooling

This parameter was introduced in Bambu Studio 1.10. In previous versions, overhang paths were not included in the "Slow Printing Down for Better Layer Cooling" calculation. This could lead to anomalies, such as the overhang portion of a single path printing faster than the non-overhang portion.

When enabled, areas exceeding the overhang threshold will be included in the cooling slowdown calculation, preventing sudden speed increases in local overhang areas.

- The percentage represents the overhang degree threshold.
  - If set to **25%**, lines with an overhang degree of up to 25% are included in the cooling slowdown logic.
  - If set to **100%**, all lines with any overhang are included.
- The final printing speed after slowdown will be the lower value between the "Overhang Slowdown" calculation and the "Cooling Slowdown" calculation.

![bambustudio_cooling_overhang_threshold_for_participating_cooling.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_overhang_threshold_for_participating_cooling.png)

- *Left image: Overhangs excluded from cooling slowdown.*
- *Right image: Overhangs included in cooling slowdown.*

![bambustudio_cooling_suspension_comparison.jpg](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_suspension_comparison.jpg)

##### Fan Speed for Overhangs

When printing bridges or overhangs exceeding the set threshold, the part cooling fan is forced to run at this specific speed. Forced cooling ensures better print quality for overhangs and bridges.

![bambustudio_cooling_fan_speed_for_overhangs.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_fan_speed_for_overhangs.png)

##### Pre Start Fan Time

Since it takes time for the fan to ramp up speed, you can choose to start the cooling fan **0–5 seconds** before the overhang structure is printed. This ensures the overhang area receives timely and sufficient cooling immediately upon extrusion.

![bambustudio_cooling_pre_start_fan_time.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_pre_start_fan_time.png)

#### Auxiliary Part Cooling Fan

##### Fan Speed

This parameter sets the speed of the auxiliary part cooling fan located on the side of the printer chassis. During printing, this fan runs at a constant speed and does not automatically adjust. If the printer does not have an auxiliary part cooling fan installed, this setting is ignored.
 ![bambustudio_cooling_fan_speed.png](https://wiki.bambulab.com/bambu-studio/toolbar/cooling/bambustudio_cooling_fan_speed.png)

### Seam

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/Seam>_

#### Introduction

The seam is a kind of gap between the start and end points of each perimeter of the layer( Unless you enable the Spiral Vase mode, refer to [Spiral Vase | Bambu Lab Wiki](https://wiki.bambulab.com/en/software/bambu-studio/spiral-vase)). It leaves vertical seams on the surface of the model, which is unavoidable in FDM 3D printing. Seams can be well hidden on irregular surfaces such as those with concave and convex vertices. On the other hand, some models with circular surfaces (such as cylinders) will not be able to hide the seams, which will be very obvious.

![](https://wiki.bambulab.com/knowledge-sharing/print-quality/%E5%9C%86%E6%9F%B1%E6%8E%A5%E7%BC%9D.png)

**Fig.1 Seams on the surface of the cylinder**

As shown in Fig.2-2, the white points are the seams of layer 53.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/seam/explain-1.png)      **Fig.2-1** | ![](https://wiki.bambulab.com/software/bambu-studio/seam/explain.png)      **Fig.2-2 Seam** |

#### Seam settings

The page for seam settings is as follows, where Seam position, Seam gap, Wipe speed, and Role base wipe speed can be applied to all types of seams. The remaining settings belong to Scarf seams, which will be introduced in a separate section in the following text.

> Some parameters require enabling "Develop Mode", which can be activated by pressing "Ctrl+P".

![](https://wiki.bambulab.com/software/123.png)

##### Seam options

For better print quality, the seam position can be set in the process presets. There are four types of seam positions to choose from: Nearest, Aligned, Back, and Random.

![](https://wiki.bambulab.com/software/bambu-studio/seam/%E6%8E%A5%E7%BC%9D%E4%BD%8D%E7%BD%AE1en.png)

###### Nearest

“Nearest” first finds all possible candidate positions by the following priority: concave non-overhang vertex > convex non-overhang vertex > a non-overhang vertex > overhang vertex.

That is, it will preferentially select concave or convex non-overhanging vertices to make the seam position more hidden. If your model has sharp corners, this will effectively make the seam **invisible**.

However, if the current layer does not have either of these vertices available, it selects from among the other candidate non-overhang vertices so that it is closest to the end of the previous print path. As a result, this option optimizes the traveling path to minimize the impact of filament stringing.

![](https://wiki.bambulab.com/software/bambu-studio/seam/nearest.png)

**Nearest**

###### Aligned

The seam placing logic is the same as “Nearest**”** for finding the candidates, but it will choose the one that is nearest to the start point of the previous layer. This will ensure the seam is mostly aligned throughout the whole object.

![](https://wiki.bambulab.com/software/bambu-studio/seam/alig-1.png)

**Aligned**

###### Back

The seam will be set behind the model. If you want to get a smooth surface in the front, such as an Iron Man mask, it will be a good choice.

![](https://wiki.bambulab.com/software/bambu-studio/seam/back-1.png)

**Back**

###### Random

Random seams will select a different location on each layer to place the seams, making the seams look less uniform and less obvious than "aligned" or "back". But it will cause some "zits" effects on the surface of the model.

![](https://wiki.bambulab.com/software/bambu-studio/seam/%E9%9A%8F%E6%9C%BA%E6%8E%A5%E7%BC%9D.png)

**Random**

##### Seam Gap

To make the seams look more hidden, the extrusion is stopped in advance when printing the inner and outer walls, leaving a gap at the seam position to accommodate excess material. This length is expressed as a percentage of the current nozzle diameter. The default value is 15%.

![](https://wiki.bambulab.com/software/bambu-studio/seam/%E6%8E%A5%E7%BC%9D%E9%97%B4%E9%9A%94en.gif)

##### Wipe speed

When retraction, a short wiping is usually performed to clean the nozzle (details can be found in [Retraction | Bambu Lab Wiki](https://wiki.bambulab.com/en/software/bambu-studio/parameter/retraction)), and the wiping speed can be adjusted. This value is expressed as a percentage and will be calculated based on the percentage of traveling speed. For example, **setting the wiping speed to 80% means that the wiping speed = the traveling speed * 80%.**

![](https://wiki.bambulab.com/software/bambu-studio/seam/%E6%93%A6%E6%8B%AD%E9%80%9F%E5%BA%A6en.png)

##### Manual-seam painting

Sometimes the auto seam position may be not ideal, you can customize the seam position by manually painting the method. The seam painting function can be enabled here:

![](https://wiki.bambulab.com/software/bambu-studio/seam/z%E7%BC%9D%E7%BB%98%E5%88%B6en.png)

Specific operations are shown in the following GIF:

![](https://wiki.bambulab.com/software/bambu-studio/seam/%E6%89%8B%E5%8A%A8%E7%BB%98%E5%88%B6%E6%BC%94%E7%A4%BAen.gif)

#### Scarf seam

Bambu Studio introduced scarf seams in version 1.9, which in most cases can reduce the visibility of seams. This feature changes the routing of the seam, making it overlap like a scarf. Segmented flow control and wipe speed control, improve riveting to weaken the seam. The following is a GIF of the scarf seam.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9D%E7%A4%BA%E6%84%8F%E5%9B%BEen.png)

From the picture, it can be seen that by controlling the nozzle height at the starting point and the amount of extruded material, the joint can be more tightly combined at the starting and ending points. The following is a detailed rendering of the routing:

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9D%E8%B5%B0%E7%BA%BF%E6%B8%B2%E6%9F%93%E5%8A%A8%E5%9B%BEen.gif)

##### Filament scarf seam settings

Starting from version 1.10, you can set whether to enable scarf seams for each filament in the filament settings.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%9D%90%E6%96%99%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9D%E5%8F%82%E6%95%B0en.png)

##### Scarf seam type

There are a total of 3 options for scarf seam types: **None, Contour, Contour and Hole.** To enable the scarf seam, you can select **"Contour"** or **"Contour and Hole"**. Definitions of contour and hole can be found in the wiki: [XY Hole/Contour compensation | Bambu Lab Wiki](https://wiki.bambulab.com/en/software/bambu-studio/xy-hole-contour-compensation)

Here are some examples of using torus:

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E5%9C%86%E7%8E%AF%E6%99%AE%E9%80%9A%E6%8E%A5%E7%BC%9Den.png)

Select "Contour" at the scarf seam:

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E5%9C%86%E7%8E%AF%E8%BD%AE%E5%BB%93%E6%96%9C%E6%8B%BCen.png)

Select "contour and hole" at the scarf seam:

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E5%9C%86%E7%8E%AF%E8%BD%AE%E5%BB%93%E5%92%8C%E5%AD%94%E6%96%9C%E6%8B%BCen.png)

##### Scarf start height

The scarf start height refers to the Z height when the nozzle begins to print the wall, and this value can be expressed in millimeters or as a percentage of the current layer height, such as 10% represents the starting height of the scarf seam is 10% of the current layer height. If the starting height is set to 100%, it will become an ordinary seam.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9D%E8%B5%B7%E5%A7%8B%E9%AB%98%E5%BA%A6%E7%A4%BA%E6%84%8F%E5%9B%BEen.png)

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E8%B5%B7%E5%A7%8B%E9%AB%98%E5%BA%A610_en.png)

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E8%B5%B7%E5%A7%8B%E9%AB%98%E5%BA%A650_en.png)

##### Scarf slope gap

When the scarf slope gap is enabled, the inner wall is cut to accommodate the excess material. This parameter, if expressed in percentages, is calculated by multiplying a specific factor by a percentage of the nozzle diameter to determine the gap.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9D%E9%97%B4%E9%9A%94en.gif)

##### Scarf length

The length of the scarf seam and the scarf seam will be disabled when the length is 0. If 'scarf around the entire wall' is enabled, the scarf length set will not work.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9D%E9%95%BF%E5%BA%A6en.jpg)

##### Smart scarf seam application

Bambu Studio has a smart seam selection function, which selects whether to apply scarf seams based on the characteristics of the model. When the overhang of the seam position is too large, and when the angle of the seam position is small enough to conceal the seam, it will not use scarf seams. When the wall does not have a suitable sharp angle that traditional seams cannot effectively conceal, then scarf seams are applied. Turn off this option to apply scarf seams to all areas.

##### Seam placement away fromoverhangs(experimental)

Due to the small extrusion of the scarf seam, the lines may be difficult to bond properly in the hanging area. To ensure normal printing of the appearance surface, this option should only be applied to areas with low overhang degrees. Ordinary seams are still used in areas with high overhang degrees.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%82%AC%E5%9E%82%E5%8C%BA%E5%9F%9F%E4%B8%8D%E5%BA%94%E7%94%A8%E6%96%9C%E6%8B%BC%E6%8E%A5%E7%BC%9Den.png)

##### Scarf application angle threshold

Due to the ability to effectively conceal seams at sharp angles, scarf seams are not enabled by default when the model surface has sharp angles. Instead, seams can be directly hidden at sharp angles. If you want to apply scarf seams at sharp angles or need to adjust the application range of scarf seams, you can adjust the angle threshold parameter.

This option sets the angle threshold to determine whether to apply the scarf seam. If the seam angle within the perimeter of a single layer exceeds this value (indicating that the model surface does not have a sharp enough angle), scarf seams should be applied, otherwise, scarf seams will not be applied.

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%8E%A5%E7%BC%9D%E8%A7%92%E5%BA%A6%E5%A4%A7%E4%BA%8E%E8%A7%92%E5%BA%A6%E9%98%88%E5%80%BCen.png)

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%8E%A5%E7%BC%9D%E8%A7%92%E5%BA%A6%E5%B0%8F%E4%BA%8E%E8%A7%92%E5%BA%A6%E9%98%88%E5%80%BCen1.png)

#### Scarf seam effect adjustment

If you are not satisfied with the effect of the scarf seam, you can adjust the following parameters to optimize the seam effect.

##### Scarf around entire wall

As the name suggests, extend the scarf seam to the entire wall. **Enabling this option requires caution as it may result in using a smaller extrusion amount for the entire perimeter, which may cause poor adhesion between lines and result in surface defects.**

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E5%9B%B4%E7%BB%95%E6%95%B4%E4%B8%AA%E5%9B%B4%E5%A2%99en.gif)

##### Scarf steps

The minimum number of sections required for the scarf seam, that is, the slope of the starting position of the scarf seam is divided into several steps. However, it should be noted that some seam positions cannot be accurately divided into the set number of steps, so **the actual scarf steps ≥ the set scarf steps.**

![](https://wiki.bambulab.com/software/bambu-studio/seam/scarf-seam/%E6%96%9C%E6%8B%BC%E6%AE%B5%E6%95%B0en.gif)

##### Scarf joint for inner walls

Enabling this option, the inner walls will also adopt scarf seams, and this option is enabled by default.

### Support settings

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/support>_

#### Support Structures

Support structures are essential in 3D printing, as you will inevitably encounter models with large overhangs. Bambu Studio is equipped with comprehensive support features.

You can watch the following videos to learn the basic and advanced operations of support settings.

For more detailed introductions to support settings, please refer to the content below.

#### Why Use Support Filament

Support structures are critical in 3D printing. Some models have large-angle overhangs. To prevent the filament from sagging or deforming at the overhang areas due to **gravity**, these areas require additional support to ensure the printed part is formed correctly.

| ![](https://wiki.bambulab.com/software/bambu-studio/support/%E6%94%AF%E6%92%91-image-10.png) | ![image.png](https://wiki.bambulab.com/software/bambu-studio/support/image.png) |
| --- | --- |

Support structures need to be removed after printing, so there must be a gap (**Top Z Distance**) between the model and the support. If the support filament is the same as the model's main filament, when using default parameters, you need to balance easy removal and high-quality support surfaces, making it difficult to improve the printing quality of the support surface through parameter adjustments.

![image2.1.png](https://wiki.bambulab.com/software/bambu-studio/support/image2.1.png)

If using dedicated support filament, you can ensure there is no gap between the model and the support (Top Z Distance = 0) while still enabling easy removal of the support. The support surface of the model can achieve a smooth printing effect, as shown in the image below:

![image4.png](https://wiki.bambulab.com/software/bambu-studio/support/image4.png)

#### Introduction to Dedicated Support Filament

Filament can be divided into main filament and support filament based on the part of the model it forms. **Main filament** includes PLA, PLA-CF, PETG, PETG-CF, ABS, ASA, PC, PA, PA-CF/GF, PA6-CF/GF, PAHT-CF/GF, PET-CF/GF, etc. Generally, support filament can be classified by removal method:

- **Mechanical Removal:** Brittle materials (such as Bambu Support for PLA, Bambu Support for ABS, etc.) are suitable for manual peeling. They work because the support filament has a certain degree of compatibility and temperature matching with the main filament, but is still easy to separate, achieving high-quality support and easy removal. To save printing time and filament, it is recommended to use mechanical removal support filament only for the support interface.

| ![image10.png](https://wiki.bambulab.com/software/bambu-studio/support/image10.png)Support filament used only for support interface | ![image3.png](https://wiki.bambulab.com/software/bambu-studio/support/image3.png)Support filament used for support interface + support core |
| --- | --- |

- **Dissolvable Removal:** Water-soluble materials (such as PVA) are suitable for complex internal supports or scenarios where mechanical removal support materials are difficult to peel off.

| ![](https://wiki.bambulab.com/software/bambu-studio/support/%E6%94%AF%E6%92%91-image-6.png)Mechanical Removal | ![](https://wiki.bambulab.com/software/bambu-studio/support/%E6%94%AF%E6%92%91-image-8.png)Dissolvable Removal |
| --- | --- |

The following rules apply to the use of dedicated support filament:

1. Main filament can be used to print both the main structure and support structures (however, in some cases, the support structures may be difficult to remove), while support filament is only suitable for printing support structures (if used to print the main structure, the quality and strength of the printed part will be low).
2. The standard setup is to use main filament for the main structure and corresponding support filament for the support structures. You can refer to the following examples:    (1) If printing the main structure with PLA Basic or PLA-CF, you can choose Bambu Support for PLA, Bambu Support for PLA/PETG, PVA, or other applicable support filament depending on the situation;    (2) If printing the main structure with PETG Basic, PETG HF, or PETG-CF, you can choose Bambu Support for PLA/PETG or other applicable support filament depending on the situation;    (3) PETG HF, PETG Basic, and PLA Basic can be used as support for each other in some scenarios. For usage instructions, please refer to: [Guide to Mutual Support Printing with PLA Basic and PETG HF](https://wiki.bambulab.com/en/filament-acc/filament/h2d-pla-and-petg-mutual-support)

Below is an overview of Bambu Lab support filament:

| Support Filament Type | Bambu Support for PLA | Bambu Support for PLA/PETG | PVA | Bambu Support for PA/PET |
| --- | --- | --- | --- | --- |
| Compatible Main Filament Types | PLA, PLA-CF, etc. | PLA, PLA-CF, PETG, PETG-CF, etc. | PLA, PLA-CF, etc. | PA, PA-CF/GF, PA6-CF/GF, PAHT-CF/GF, PET-CF/GF, etc. |
| Features | 1. Easy to remove support structures, high-quality support surfaces;   2. Not prone to moisture absorption, low requirements for drying and moisture protection. | 1. Easy to remove support structures, high-quality support surfaces;   2. Compatible with both PLA and PETG. | 1. Water-soluble, suitable for scenarios where manual support removal is inconvenient;   2. Easy to remove support structures, high-quality support surfaces;   3. Prone to moisture absorption, high requirements for drying and moisture protection;   4. It is recommended to check the [PVA Printing Guide](https://wiki.bambulab.com/en/filament-acc/filament/pva-printing-guide) before printing | 1. Easy to remove support structures, high-quality support surfaces;   2. Prone to moisture absorption, high requirements for drying and moisture protection. |

**Recommended Usage Schemes:**

1. For most printing scenarios, it is recommended to use support filament only for the support interface, and use main filament for the support core to save printing time;
2. For some special printing scenarios, support filament can be used for both the support core and support interface (i.e., the entire support structure). However, thin, tall support structures for some models may deform or collapse, affecting printing quality.

> **Warning:**
>  **Do not use mismatched support filament and main filament during printing (e.g., using Bambu Support for PLA to support high-temperature filament such as ABS, ASA, PC, or PAHT-CF, or using Bambu Support for PA/PET to support low/medium-temperature filament such as PLA or PETG), as this may cause malfunctions such as extruder or nozzle clogging.**

#### Process Parameter Setting Guide for Dedicated Support Filament

Bambu Lab dedicated support filament comes with an RFID chip for automatic recognition. Selecting the corresponding filament will automatically sync the parameters; the slicer software also features an interactive interface for automatically setting process parameters for dedicated support filament, which can be triggered as follows:

![output.webp](https://wiki.bambulab.com/software/bambu-studio/support/output.webp)

The effect after automatically setting the process parameters is as follows:

| ![image7.png](https://wiki.bambulab.com/software/bambu-studio/support/image7.png) | ![image8.png](https://wiki.bambulab.com/software/bambu-studio/support/image8.png) |
| --- | --- |

> **Note:**
>  **After setting water-soluble support filament as described above, additional parameters need to be configured. Please refer to the [PVA Printing Guide](https://wiki.bambulab.com/en/filament-acc/filament/pva-printing-guide)**.

#### Using ABS/ASA as Support Filament for Engineering Filament

If printing the main structure with high-temperature filament such as PA6-CF/GF or PAHT, you can choose ABS or ASA as support filament depending on the situation; the usage method and process parameter settings are the same as those for mechanical removal support filament introduced above.

It should be noted that when using ABS or ASA as support filament, it is generally recommended to only print the support interface in most cases; since there is no cross-purging between two materials in dual-head printing, the adhesion between ASA and PAHT-CF, PA6-CF is relatively low, so using support filament (ASA) to print the support core will improve printing success rate; the table below summarizes the recommended support filament and support settings for all high-temperature filament sold by Bambu Lab:

| Main Filament | Recommended Support Filament | Recommended Support Settings    (Single-nozzle Models) | Recommended Support Settings    (Dual-nozzle Models with Nozzle Switching) |
| --- | --- | --- | --- |
| PA6-GF | Bambu ABS | It is recommended to use support filament only for the support interface | It is recommended to use support filament only for the support interface, or for both the support core and support interface |
| PA6-CF | Bambu ASA | Same as above | It is recommended to use support filament for both the support core and support interface |
| PET-CF | Bambu ASA | Same as above | It is recommended to use support filament only for the support interface, or for both the support core and support interface |
| PAHT-CF | Bambu ASA | Same as above | It is recommended to use support filament for both the support core and support interface |
| PPA-CF | Bambu ASA | Same as above | It is recommended to use support filament only for the support interface, or for both the support core and support interface |
| PPS-CF | Bambu ASA | Same as above | It is recommended to use support filament only for the support interface, or for both the support core and support interface |

> **Note:**
>
> - The parameters listed above are based on tests conducted with Bambu Lab official filaments. Third-party filaments may vary in performance. For optimal print results, we recommend using Bambu Lab official filaments.
> - Tests have shown that when Bambu ASA is used as support material, its adhesion to main materials PA6-CF and PAHT-CF is relatively weak, and there is a risk of falling off if only the support interface is printed. Therefore, it is recommended to prioritize using Bambu ASA for both the support core and support interface
> - All the above printing parameters use the default parameters of Bambu Studio
> - Tests have shown that when the model has high infill density, warping is likely to occur at the edges. It is not recommended to use the support filament combinations in the above table for printing high-infill models; it is recommended to use self-support instead
> - Most CF (carbon fiber) reinforced filaments do not have RFID tags, so they cannot be used in the AMS. Because of this, this method works best with dual-nozzle printers. If you still want to use support filament or print in multiple colors on a single-nozzle printer, please see [Multi-Color Printing with External Spool](https://wiki.bambulab.com/en/bambu-studio/multi_color_with_external). Decide whether to enable it based on your printing needs and how often the model changes colors.

The following images show ASA being used as support material for PAHT-CF on an X1C.

| ![](https://wiki.bambulab.com/software/bambu-studio/support/%E6%94%AF%E6%92%91-image-2.png) | ![](https://wiki.bambulab.com/software/bambu-studio/support/%E6%94%AF%E6%92%91-image-3.png) |
| --- | --- |

> **Note:**
>  Bambu ABS and Bambu ASA are not dedicated support filament, so when selecting these two filament as support filament, the support parameters will not be generated automatically. You need to set the parameters manually as shown in the images below.

| ![image9.png](https://wiki.bambulab.com/software/bambu-studio/support/image9.png) | ![image8.png](https://wiki.bambulab.com/software/bambu-studio/support/image8.png) |
| --- | --- |

#### **Support Structure settings**

Bambu Studio features a full page of support settings, as shown below.

![](https://wiki.bambulab.com/software/bambu-studio/support/studio%E6%94%AF%E6%92%91%E7%95%8C%E9%9D%A2en.png)

#### Support types

There are two basic types of support structures: normal and tree. The main differences between them are:

**1. Normal supports** directly projects the overhangs down to the heat bed, and gets the support body.

**2. Tree supports** samples the overhangs to get the so-called `nodes`, each node is represented as a circle. And then the nodes are propagated down to the heat bed. During propagation, the circles may be enlarged to get better strength and may be moved away from the object so the supports are less likely to collide with the object.

On the support page, there are 5 types of supports that you can choose, which are variants or combinations of these two types. These include:

1. **Normal (auto):** Normal supports with automatically detected overhangs.
2. **Tree (auto):** Tree supports with automatically detected overhangs
3. **Hybrid (auto):** A combination of normal (auto) and tree (auto). When the overhang area is large, use normal (auto), otherwise use tree (auto).    After version 1.4.1, we moved hybrid(auto) from type to style. To enable it, please select type=tree(auto) and style=Tree Tybrid.     We made this change because we added a new style (tree slim), and possibly we'll add more styles. It's not appropriate to use support types to do this, or we'll have too many support types. But in fact, tree slim, tree strong, and tree hybrid are only different in some parameters. They are all tree support essentially.
4. Normal (manual): Generates normal support only on support enforcers. For manual settings, please refer to the Wiki [Support Painting Guide](https://wiki.bambulab.com/en/software/bambu-studio/support-painting).
5. Tree (manual): Generate tree supports only on support enforcers. For manual settings, please refer to the Wiki [Support Painting Guide](https://wiki.bambulab.com/en/software/bambu-studio/support-painting).

#### Support Styles

Both normal and tree supports have different styles to adjust the final support structure further.

Normal support has two styles:

**1. Grid**: The support region is expanded and normalized to rectangles. This is the default style of normal support.

**2. Snug**: The support region is NOT expanded, but tightly aligned with the overhang areas. This style is useful when the expanded supports have any side effects, such as in the following case.

![](https://wiki.bambulab.com/software/bambu-studio/support/normal_grid_is_bad.png)

![](https://wiki.bambulab.com/software/bambu-studio/support/normal_sng_is_good.png)

Tree support has three styles:

**1. Tree Slim**: This features an aggressive branch-merging strategy. As a result, a much smaller support volume is generated without sacrificing strength (by automatically increasing the wall count and using smoother branches).

![image12.png](https://wiki.bambulab.com/software/bambu-studio/support/image12.png)

**2. Tree Strong**: It features a relatively conservative branch-merging strategy, resulting in connected strong tree branches that are sometimes difficult to remove.

![image13.png](https://wiki.bambulab.com/software/bambu-studio/support/image13.png)

**3. Tree Organic**: It features organic-shaped tree branches, and also an aggressive branch-merging strategy. This style was introduced in Cura Slicer, then ported to PrusaSlicer, and later ported by us.

![image15.png](https://wiki.bambulab.com/software/bambu-studio/support/image15.png)

**4. Tree Hybrid**: The current default style, which is the hybrid of tree support and normal grid. Below the big flat overhang regions, normal grid supports are generated. Otherwise, it will generate the tree support.

![image14.png](https://wiki.bambulab.com/software/bambu-studio/support/image14.png)

> **Note:** In the default settings, the support style is selected according to the following rules:
>
> - If support material is enabled (to improve overhang quality) or adaptive layer height is enabled (Tree Organic does not support adaptive layer height), Tree Hybrid is used by default.
> - Otherwise, Tree Organic is used by default.
>
> ![image11.png](https://wiki.bambulab.com/software/bambu-studio/support/image11.png)

#### Common options

##### **Threshold Angle**

The threshold angle is the maximum slope angle that needs support. If a surface's slope angle to the horizon is less than this threshold value, support will be generated when the support type is auto.
 The larger this angle is, the more supports will be generated. The default threshold angle is 30 degrees. For most materials, this is a safe angle to print without support.

![support_angle.png](https://wiki.bambulab.com/software/bambu-studio/support/support_angle.png)

##### Raft

Raft is a type of support, which is used to generate support at the bottom of the model to lift it up. Usually, when printing materials such as ABS that are prone to warping, then you can enable the raft. Below are the settings that you can find here:

**1. The raft contact Z distance:** It represents the distance between the top of the raft layer and the model.

**2. The first layer density:** This refers to the density of the first layer of the raft and the support.

**3. The first layer expansion:** It can be used to expand the first raft and support layer, improving the bed adhesion.

![](https://wiki.bambulab.com/software/bambu-studio/support/%E7%AD%8F%E5%B1%82en.png)

##### **Support Filament**

Support is composed of two parts: **base** and **interface**. **Interface** layers are the layers touching the object. The rest of the support body is the **base**. Both parts can use different filaments than the object. Default means no filament is specified and the filament printed at the current layer is used, so filament switching time is minimized. Usually, we select specialized support materials such as support W as the support surface material.

![](https://wiki.bambulab.com/software/bambu-studio/support/%E6%94%AF%E6%92%91%E9%9D%A2en.png)

##### **Top Z distance & Support/object XY distance**

The XY distance between the support and the object and the top Z distance from the support top to the object are shown below. When setting to 0, the support filament is assumed to be support material, e.g. Bambu Support W.

When the filament of the support interface is a kind of support filaments, such as Bambu Support for PLA, Bambu Support for PLA/PETG, Bambu Support for PA/PET or etc., the top Z distance can be set to be 0. However, when the filament of the support interface is also the body filament, it's not recommended to be set to be 0 but about 0.2, or the support structure will be really hard to remove *. The following are the values of top Z distance and their results:

|  |  |  |
| --- | --- | --- |
| Top Z distance value | **bigger** | **smaller** |
| Support structure removal | easier | harder |
| Interface quality | lower | higher |

When printing a model with support structure, it is necessary to remove the support structure within 2 hours to prevent it from being difficult to remove or remaining residues on the prints after being damp and softened, especially for body filaments like most kind of Nylon (PA) which includes PA-CF, PA6-CF, PA6-GF and etc., and support filaments like PVA and Support for PA/PET, since then tend to absorb moisture from the air. If it is difficult to remove the support because the prints have been placed for too long, please dry them, let them cool down, and then remove the support in time.

![distance.png](https://wiki.bambulab.com/software/bambu-studio/support/distance.png)

##### Interface Layers

The interface is divided into top and bottom. For the top interface, increasing this value can improve the print quality of the supported areas of the model.

When the interface is set to 0, the supported area will lack sufficient underlying support during printing, which can cause lines to sag and affect model quality.

![topen.jpg](https://wiki.bambulab.com/software/bambu-studio/support/topen.jpg)

When the interface is set to 3, a stable and flat platform will be generated for the supported area. This ensures the lines sag as little as possible, providing quality assurance.

![top2.jpg](https://wiki.bambulab.com/software/bambu-studio/support/top2.jpg)

> The supported area will only be completely free from sagging when the Top Z Distance is also set to 0.

The principle for the bottom interface is the same as for the top interface. More bottom interface layers result in stronger support stability. When the bottom interface is set to 0, the first layer of the support will be lines, which is very detrimental to subsequent printing.

![bottom.jpg](https://wiki.bambulab.com/software/bambu-studio/support/bottom.jpg)

##### **Base & Interface Pattern Settings**

**1. Base Pattern:**
 This is the infill pattern of the support base. There are currently 6 patterns, as shown below.

- **Default:** Automatically selects the optimal pattern based on the support type and material. Typically rectilinear for normal supports or hollow for tree supports.
- **Rectilinear:** It is the most commonly used support and **default pattern for normal support**, which usually goes in two directions (left to right, front to back)
- **Rectilinear grid:** It is similar to **rectilinear**, except it alternates the direction of every layer, so its strength is much better but can be harder to remove.
- **Honeycomb:** It is different than the other two, and is a good balance of strength and stability for taller support structures.
- **Lightning:** It is an extremely sparse infill pattern for *tree support,* which can save both material and printing time, but with lower strength.
- **Hollow:** It is the default pattern for tree support, which means no infill at all.

![base_pattern.png](https://wiki.bambulab.com/software/bambu-studio/support/base_pattern.png)

![](https://wiki.bambulab.com/software/bambu-studio/support/base_pattern_lightning_hollow.png)

- **Base pattern spacing:** For **rectilinear** and **rectilinear grid** patterns, this is the spacing between base pattern lines. For the **honeycomb** pattern, this is the radius of each honeycomb cell. So when this value is set to 0, the **honeycomb** pattern degenerates to **rectilinear**.
- **Pattern angle:** Set the rotation Angle of the support pattern on the horizontal plane.
- **Top interface layers:** The number of top interface layers. The overhang quality can be improved if we increase this value, at the cost of slightly more material.

**2. Interface pattern:**
 This is the line pattern of interface layers. There are currently 4 patterns available:

- **Default**: kind of auto pattern. The default pattern with support material is rectilinear and concentric with other materials. Support materials may be soluble or not.
- **Rectilinear**: rectilinear pattern, suitable for most cases.
- **Concentric**: concentric circular pattern, which is stronger on non-planar surfaces and useful with support materials. For best surface quality we can set a very small interface spacing (e.g. 0) when using cocentric pattern and support material.
- **Rectilinear interlaced**: Offset rectilinear pattern between layers, creating an interlaced effect. Improves adhesion and smoother undersides but may be harder to remove than standard rectilinear.
- **Grid**: A crisscrossed line pattern that is very strong and stable. Provides excellent support for large flat surfaces but can be more difficult to detach. Best used when high rigidity of the support interface is needed.

![interface_pattern.png](https://wiki.bambulab.com/software/bambu-studio/support/interface_pattern.png)

- **Don't support bridges:** For normal support, this option controls whether to remove supports for bridges. For tree support, we replace this option with **Max bridge length** which will be explained later.
- **Thick bridges:** If enabled, bridges will be extruded with higher flow, which means bridges are more reliable and can bridge for longer distances. However, the overhang surface quality may be worse because of possible overflow.

##### Tree Support-Only Options

Tree support has more options.

- **Tree support branch distance**: The distance between neighboring tree support nodes. A smaller value means higher sampling density on the overhang surface and, therefore better surface quality, at the cost of more removal difficulty.
- **Tree support branch diameter**: The initial diameter of the tree support node. A larger value means stronger tree supports, also more difficult to remove.
- **Tree support branch angle**: The angle of tree branches stretching out. Larger values mean that tree support branches can be printed more horizontally, with a higher ability to avoid objects and extend further out.
- **Interface pattern**: The default pattern for tree supports is hollow, but if you are using some fragile materials, such as silk PLA, it is recommended to switch to other options.
- **Max bridge Length**: The max allowed bridging length for overhangs. If an overhang is rectangular, it is regarded as a bridge. A short bridge can be printed well enough without support, because the two ends of the extrusion lines are well supported. The max allowed bridging distance may be different for different materials. When a bridge is larger than *max bridge length*, it's divided into equal segments and only the contacting points are supported.

![max_bridge_length.png](https://wiki.bambulab.com/software/bambu-studio/support/max_bridge_length.png)

##### Support Independent Layer Height

When enabled, the layer height for supports will no longer match the model's layer height but will be set independently. For models with extensive support structures, this feature can effectively increase printing speed and reduce total print time. The support layer height parameter will be automatically adjusted by the software.

![disableen.jpg](https://wiki.bambulab.com/software/bambu-studio/support/disableen.jpg)
 ![enableen.jpg](https://wiki.bambulab.com/software/bambu-studio/support/enableen.jpg)

#### Suitable Cases for Each Type

##### Normal is Better

For large planar overhang, Normal supports usually give better surface quality than tree supports. That's why we propose hybrid support. So it's safe to choose hybrid(auto) in general, since for these cases hybrid(auto) will degenrate to normal.

![l_shape.png](https://wiki.bambulab.com/software/bambu-studio/support/l_shape.png)

![l_shape_supports_compare.png](https://wiki.bambulab.com/software/bambu-studio/support/l_shape_supports_compare.png)

##### Tree is Better

For objects with complex structures and most of the overhangs are small, non-planar surfaces, tree or hybrid(auto) supports give stronger support structure, less material, and less time cost, while keeping similar surface quality.

![nubius_dog_supports_compare.png](https://wiki.bambulab.com/software/bambu-studio/support/nubius_dog_supports_compare.png)

#### Smart Overhang Detection

Detecting the overhangs is the first step for support generation. The usual method is simply taking the difference between the current layer's polygons and the lower layer's polygons. This is far from enough. Some special cases need different strategies.

##### Small Overhangs

The overhang is so small that needs not to be supported at all. Below is an example.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/support/unicorn-head.png) | ![](https://wiki.bambulab.com/software/bambu-studio/support/unicorn-head-support-prusa.png) |

##### Cantilevers

The overhang is only supported by one end, while the other end flies in the air. This type of overhang must be supported, even if it's small.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/support/cantilever.png) | ![](https://wiki.bambulab.com/software/bambu-studio/support/cantilever-overhangs.png) |

##### Sharp Tails

The overhang flies in the air and far away from other parts. Only supporting the bottommost tip isn't enough. Instead, the flying part needs to be surrounded for a larger z-span.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/support/unicorn-tail.png) | ![](https://wiki.bambulab.com/software/bambu-studio/support/unicorn-tail-support-prusa.png) |

These 3 types of special overhangs are called critical overhangs. Now we can detect them and generate suitable support structures for them. Below is the result of the model “unicorn”.

|  |  |
| --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/support/unicorn.png) | ![](https://wiki.bambulab.com/software/bambu-studio/support/unicorn-support-bambu.png) |

We also have an option to support only the critical overhangs.

![](https://wiki.bambulab.com/software/bambu-studio/support/option-support-critical-regions-only.png)

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [Technical ticket](https://bambulab.com/en/my/support/tickets?from=5) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.

### Brim

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/auto-brim>_

#### Introduction

A brim is a single-layer flat area around the base of your model. Its purpose is to keep the edges of your print down and make the contact area between your print and the build plate bigger.

- The bigger surface area allows your print to stick better on the build plate. This is pretty useful for tall and thin objects.
- Brim can also help improve the bonding of the edges on the bottom of the model. Some materials tend to shrink easily when cooled down (such as ABS) and tend to warp easily. Having a brim of sufficient width will keep the model edges in place, preventing this warping.

![](https://wiki.bambulab.com/software/bambu-studio/brim/brim_example.png)

The brim parameters are in the **Other** group on the left sidebar. They are all per-object parameters, so you can set different values for each object.

![](https://wiki.bambulab.com/software/bambu-studio/brim/brim_per_object.png)

#### Brim Types

![](https://wiki.bambulab.com/software/bambu-studio/brim/brim%E8%AE%BE%E7%BD%AEen.png)

##### Auto (default)

It is a new feature designed by Bambu Lab. In this mode, Bambu Studio automatically analyzes each part of each individual object and generates a brim with the proper width for it. The following factors are mainly considered:

###### **The shape and orientation of parts**

A *taller part with* a *smaller* footprint usually needs a wider brim to prevent itself from being toppled by the printer's nozzle during printing. A tall*er part with* a small*er* footprint is easily detached from the heat bed as the part is cooling down and therefore needs a wider brim.

![](https://wiki.bambulab.com/software/brim-generation/bending.png)

###### **Filament type**

A part with the material type *PC, ABS, PA-CF, PET-CF*, or *PLA-CF* usually results in a **wider** brim, since those materials have high thermal expansion factors and high molding temperature which results in high thermal stress at the foot of the part. On the contrary, a *TPU* part usually needs a **narrower** brim.

![](https://wiki.bambulab.com/software/brim-generation/thermal.png)

![](https://wiki.bambulab.com/software/brim-generation/filament.png)

###### **Print speed**

The maximum printing speed usually means larger shear forces between the hot end and the parts and therefore needs a **wider** brim to stick the parts on the heat bed.

![](https://wiki.bambulab.com/software/brim-generation/speed1.png)

##### Manual Brim

In addition to auto mode, you can also choose several other types of Manual Brim. Bambu Studio will generate Brim based on the "Brim width" parameter, which users can set according to actual situations. Manual Brims are divided into the following types:

###### Outer brim only

Generate Brim only around the outside of the object:

![](https://wiki.bambulab.com/software/bambu-studio/brim/%E4%BB%85%E5%A4%96%E4%BE%A7.png)

###### **Inner brim only**

If the inside of the object is hollow, Brim is generated only around the inside of the object

**Note: The inside brim can only be generated if the object itself has holes inside. If the object has no holes inside, or if it is only specially set to be hollow inside (such as using the Negative parts function), it will not be able to generate an inner brim after slicing.**

![](https://wiki.bambulab.com/software/bambu-studio/brim/%E4%BB%85%E5%86%85%E4%BE%A7.png)

###### **Outer and inner brim**

Brim will be generated around both the inside and outside of the object:

![](https://wiki.bambulab.com/software/bambu-studio/brim/%E5%86%85%E4%BE%A7%E5%92%8C%E5%A4%96%E4%BE%A7.png)

###### Painted

Removing brim can sometimes be tedious, especially when it is applied to areas where it is not needed. In such cases, you can add brim only at sharp corners of the model by **painting brim ears**, which provides targeted adhesion while making removal much easier. **For detailed instructions on how to use this feature, see [Brim Ears | Bambu Lab Wiki](https://wiki.bambulab.com/en/software/bambu-studio/brim-ears).**

![painted_brim.jpg](https://wiki.bambulab.com/software/bambu-studio/brim/painted_brim.jpg)

###### **No-brim**

No brim will be genrated.

![](https://wiki.bambulab.com/software/bambu-studio/brim/%E6%97%A0brim.png)

#### Brim Width

The desired width of the generated brim in Manual mode.

![](https://wiki.bambulab.com/software/brim-generation/brim_width1.png)

#### Brim-Object Gap

The desired gap between the object and its brim in both "*Auto*" and "*Manual*" modes. A smaller gap can improve the connection strength while a larger gap will make disassembling easier. If you set the gap to 0 and find that there is still a gap between Brim and the model, it is usually caused by turning on the "**Elephant foot compensation**" function. You can disable **“Elephant foot compensation”** to make Brim fully attached the model. The comparison is shown in the following figures:

![](https://wiki.bambulab.com/software/bambu-studio/brim/brim%E4%B8%8E%E6%A8%A1%E5%9E%8B%E7%9A%84%E9%97%B4%E9%9A%99en.png)

![](https://wiki.bambulab.com/software/bambu-studio/brim/brim%E5%92%8C%E6%A8%A1%E5%9E%8B%E5%AE%8C%E5%85%A8%E6%B2%A1%E6%9C%89%E9%97%B4%E9%9A%99en.png)

### Object List

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/object-list>_

#### Where Is the Object List

The object list is located in the left panel. You can view the object list by clicking the `Global / Objects` button and switch to the **Objects** mode.

![](https://wiki.bambulab.com/software/bambu-studio/object-list/object_list_new.png.jpg)

The Object List provides a clear view of all the whole project structure by showing a hierarchy of

- Plates
- Objects
- Parts
- Modifiers, Negative Parts, Support blockers and enforcers
- Custom parameters for each object/part

Furthermore, it provides rich functionalities.

#### Feature Introduction

##### Customize parameters for selected objects/parts

Click one or more objects, the parameter setting panel will auto-display at the bottom-left corner. The parameter values are origin from the global parameters. You may change them for each object according to your requirements. You can also change parameter values for parts in the same way.

![object_setting.png](https://wiki.bambulab.com/software/bambu-studio/object-list/object_setting.png)

If you change the parameter values for an object/part, an orange lock icon will display at the right side of the object/parts. You may reset the changes (restore to the global parameter values) by simply click this icon.

For details, please refer to [how-to-set-slicing-parameters](https://wiki.bambulab.com/en/software/bambu-studio/how-to-set-slicing-parameters).

##### Status of an object

Each column display a specific status of an object/parts.

| Icon | Status | Description |
| --- | --- | --- |
| ![](https://wiki.bambulab.com/software/bambu-studio/object-list/obj_printable.svg) | Printable | Click the icon to toggle its status.    If it is toggled on, the object will be sliced for printing.    Otherwise, the object will be skipped during slicing. |
| ![filament.png](https://wiki.bambulab.com/software/bambu-studio/object-list/filament.png) | Filament | It represents the filament for current object/parts.    Click the icon to change the filament. |
| ![](https://wiki.bambulab.com/software/bambu-studio/object-list/toolbar_support.svg) | Support Painting | There are support enforcer/blocker painted on this object.   Click the icon to edit the painting. |
| ![](https://wiki.bambulab.com/software/bambu-studio/object-list/mmu_segmentation.svg) | Color Painting | The object has been color painted.   Click the icon to edit the painting. |
| ![](https://wiki.bambulab.com/software/bambu-studio/object-list/lock_normal.svg) | Customized Parameters | Some slicing parameters have been modified for this object/part. |

Example:

![objlist_status.png](https://wiki.bambulab.com/software/bambu-studio/object-list/objlist_status.png)

##### Rename objects/parts

Renaming can be handy when you import dozens of objects/parts with generic names exported from CAD software. There are 2 ways to rename an object/part in the object list.

- Double-click on a object/part name in the Object list to rename it.
- Click on an object/part, then press space key on the keyboard

### Auto Circle Holes-contour Compensation

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/manual/auto-circle-contour-compensation>_

#### What does this feature do?

In the additive manufacturing process of 3D printing, it is often encountered that the actual size of the printed parts deviates from the ideal size, which leads to difficulties in assembling the shafts and holes, whether it is between printed parts or with the actual object. The factors that affect this size change are not only the motion accuracy of the printer, but also the thermal shrinkage and deformation of the material. This mechanism involves complex material thermoforming problems, and this function is dedicated to solving the most common and simple problem of circular hole and shaft assembly. For 3D printing of circular holes and shaft sizes of different materials, slicing algorithms will compensate accordingly, thereby achieving printing circles with smaller deviations and precision assembly with smaller tolerances.

#### Compensation principle

Studio's slicing algorithm will identify circular hole/shaft features that meet the criteria **(only for complete circles on the horizontal plane, semicircles or circles in the vertical direction will not be compensated),** and provide reasonable size compensation based on detailed test data. In this compensation process, the slicing algorithm limits the print speed of the identified circular features, making it uniform (print speed 200mm/s). At the same time, ensure that the cooling system is turned on to the maximum power during the printing process, providing a stable and efficient cooling rate of filaments. Under the premise of controlling the unified printing environment, Studio will modify the size of circular features based on the compensation model formula. The specific parameters in the compensation model formula will vary depending on the filament, and we have already built them into the slicer. You do not need to make any additional adjustments.

#### How to use this feature?

Firstly, this function is only applicable to complete circular holes/shafts on a horizontal plane, **with a diameter size within 50mm.**Therefore, if the model you are printing has such circular features and its size is important for assembly, you can select "Auto Circle Holes-contour Compensation" in the Process—Quality before slicing to enable this function. Then select the corresponding filament, slice it, and send the print task to obtain a model with a more accurate circular hole size accuracy.

![](https://wiki.bambulab.com/h2/manual/auto-circle-contour-compensation/en1/image-2.png)

The precision of the model's circular holes and shafts printed through this compensation is higher, enabling compact assembly with standard components (such as bearings) or other printed parts.

![](https://wiki.bambulab.com/h2/manual/auto-circle-contour-compensation/en1/image-1.png)

#### Matters needing attention

1. Currently, this feature is only compatible with some Bambu Official filaments, and more applicable filaments will be added in the future.
2. This feature is designed to compensate for default settings (default sparse infill, etc.). However, it will have a reduced effect on extreme settings and placements (such as 100% infill, circular shafts placed too close, etc.).
3. This feature will only apply to Bambu official dry filaments. For filaments that are damp, the size compensation effect will be reduced (dampness changes the filament's deformation and shrinkage properties). In addition, for non-Bambu official filaments, this feature may not achieve the expected effect.
4. If the filament drying effect is insufficient, the Auto Circle Contour-Hole Compensation feature may still not achieve the tightest fit. Based on our experience, **under the same parameters, dry filament results in a looser fit, and moist filament results in a tighter fit.**In this case, you can try manually adjusting the compensation parameters. Enter the compensation value in the **"User Customized Offset"** section in Studio: positive values make the assembly looser, while negative values make the assembly tighter. You can adjust the value based on your drying conditions, and we recommend using a step value of **0.02mm** for fine-tuning.

![](https://wiki.bambulab.com/h2/manual/auto-circle-contour-compensation/en1/image.png)

- This feature is only applicable to complete circles (non-ellipses) on the horizontal plane, and circles do not interfere with each other. Other situations will not be recognized and compensated by features.
- This compensation feature will automatically use the scarf seam for the wall of the shafts and hole, which can effectively hide the seams on the circular surface and ensure a more accurate circle size. You can refer to the wiki for more information about scarf seams: [Seam settings](https://wiki.bambulab.com/en/software/bambu-studio/Seam).


## Troubleshooting

### Failed to Get Network Plugin

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/failed-to-get-network-plugin>_

#### Windows

Please follow the steps below to troubleshoot:

##### Step 1. Close other Bambu Studio windows

Make sure all **Bambu Studio** windows are **closed**.

##### Step 2. Check whether you can access the plugin server

Open the following link in your browser to **check whether you can access the plugin server**:

[https://public-cdn.bambulab.cn/upgrade/studio/plugins/01.07.01.04/win_01.07.01.04.zip](https://public-cdn.bambulab.cn/upgrade/studio/plugins/01.07.01.04/win_01.07.01.04.zip)

- If the browser **starts downloading or opening** a `zip` file, the server is accessible.
- If it is not accessible, the server may be inaccessible. Please **check your network connection**.

##### Step 3. **Make sure no other program is occupying the network plugin**

**Close Bambu Studio**, **open** the folder `C:\Users\your_user_name\AppData\Roaming\BambuStudio`, and **delete** the `plugins` folder inside it.

- **If the deletion succeeds**, reopen Bambu Studio. It will automatically retry installing the plugin.
- **If fails**, the folder is being occupied by another program. Please **find the program using it** and close it, then try again. Restart your PC may help if the folder cannot be deleted. Once the folder is deleted, reopen Bambu Studio to retry installing the plugin.

> ℹ️ Apps known to occupy the plugin folder:
>
> - **Microsoft Teams**
> - **Microsoft Agent**
> - **Skype**
> - **Nvidia Broadcast**

##### Step 4. **Make sure your antivirus software is not blocking the network plugin download**

If installation still fails after the steps above, check whether your **antivirus software** has blocked or deleted the network plugin. If so, add the network plugin to your antivirus software's **whitelist**.

##### Step 5. Install the network plugin manually

If none of the above methods work, you can try installing the network plugin manually. Follow these steps:

1. Replace `AA.BB.CC` in the URL below with your Bambu Studio **version number**:

`https://api.bambulab.cn/v1/iot-service/api/slicer/resource?slicer/plugins/cloud=AA.BB.CC.00`

> **Note:**
>
> - `AA.BB.CC` corresponds to the **first three parts** of your Bambu Studio version number.
> - For example, if the version number is `01.07.03.50`, then `AA.BB.CC` corresponds to the first three parts `01.07.03`, and the replaced URL is:    `https://api.bambulab.cn/v1/iot-service/api/slicer/resource?slicer/plugins/cloud=01.07.03.00` (example).

1. Paste the replaced URL into your browser's address bar and visit it. The browser will return a JSON string like the following: (Note: Use the actual returned result. Do not use the strings and URLs in the example below directly.)

```
{"message":"success","code":null,"error":null,"software":{"type":null,"version":"01.07.03.50","description":"###https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-3###","url":"https://public-cdn.bambulab.cn/upgrade/studio/software/01.07.03.50/Bambu_Studio_win-v01.07.03.50.exe","force_update":false},"guide":null,"resources":[{"type":"slicer/plugins/cloud","version":"01.07.03.02","description":"","url":"https://public-cdn.bambulab.cn/upgrade/studio/plugins/01.07.03.02/win_01.07.03.02.zip","force_update":false}]}
```

Copy

1. In the JSON string, find the resource with the type **"slicer/plugins/cloud"**, and find its corresponding URL (the one ending with `.zip`), for example `https://public-cdn.bambulab.cn/upgrade/studio/plugins/01.07.03.02/win_01.07.03.02.zip`.
2. Copy this URL into your browser's address bar and visit it to download the correct network plugin.
3. Extract the downloaded zip file to the `C:\Users\your_user_name\AppData\Roaming\BambuStudio\plugins` folder, then restart Bambu Studio to complete the installation.

##### Step 6. If you have installed VPN / proxy software before, clear any leftover proxy / VPN settings in the system

> **When this applies**: You can access the internet normally, you can access the plugin server in Step 2, but the plugin still fails to install, and **you have installed VPN software or proxy-related apps on your computer before**.
>  **Risk warning**: The following steps will clear your system proxy settings. If your work network relies on a proxy, please record the original settings first so you can restore them.

###### 6.1 Disable LAN (Local Area Network) proxy settings

- **Path**: Control Panel → Network and Internet → Internet Options → Connections → LAN Settings
- Uncheck "**Use a proxy server for your LAN**" and "**Automatically detect settings**".

| ![](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/disable_lan_proxy_settings_1_en.png) | ![](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/disable_lan_proxy_settings_2_en.png) |
| --- | --- |

###### 6.2 Delete proxy-related environment variables

- **Path**: This PC (right-click) → Properties → Advanced system settings → Advanced → Environment Variables
- In [User variables] and [System variables], find and delete: `ALL_PROXY` / `HTTP_PROXY` / `HTTPS_PROXY`

| ![](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/delete_proxy_related_environment_variables_1_en.png) | ![](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/delete_proxy_related_environment_variables_2_en.png) |
| --- | --- |

###### 6.3 Check and fix the registry

- Press **Win+R** and type **regedit**

![check_and_fix_registry_1.png](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/check_and_fix_registry_1_en.png)

- **Navigate to**: `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Internet Settings`
- Confirm that **ProxyEnable = 0** and **ProxyServer is empty**

![check_and_fix_registry_2.png](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/check_and_fix_registry_2_en.jpg)

###### 6.4 Uninstall VPN / proxy software and restart

- In "Settings → Apps", uninstall any VPN / proxy software
- Restart your computer to apply all changes, then reopen Bambu Studio and try again

#### macOS

This type of problem is usually caused by network issues. Some VPN or security software blocks Bambu Studio from downloading the network plugin. Common ones include:

- **Cisco AnyConnect**
- **iCloud Private Relay**
- **AVG Security**

##### **Steps to disable Cisco AnyConnect**

1. Run the following command to stop "**Cisco Anyconnect Socket Filter**": `/Applications/Cisco/Cisco\AnyConnect\Socket\Filter.app/Contents/MacOS/Cisco\ AnyConnect\Socket\Filter -deactivateExt`
2. On the "**System Preferences → Network**" page, disable "**Cisco Anyconnect Socket Filter**".
3. Uninstall "**Cisco Anyconnect Socket Filter**".
4. When reinstalling Cisco AnyConnect, try installing only the "**VPN**"-related components.

![](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/wiki-printer-failed-17.png)

##### **Steps to disable AVG Security**

On the Network page in System Settings, disable AVG Security.

![](https://wiki.bambulab.com/software/bambu-studio/bambu-studio-common/wiki-printer-failed-16.png)

> **⚠️ Note:** **By obtaining or using the network plugin, you agree to and accept the Studio [**Terms of Use**](https://bambulab.com/en-us/policies/terms). If you do not agree, please do not download or use this plugin or any related features.**

#### End Notes

> We hope this guide has provided clear and practical support.
>
> If the issue remains unresolved, please submit a [support
>  ticket](https://bambulab.com/en/my/support/tickets/create) and include yourrecent printer logs and additional pictures or other details. Our technical team will review your requestand provide detailed assistance.
>  You can also visit [Bambu AI](https://support.bambulab.com/en?from=6&lang=en-us),which can instantly answer common questions and provide you with operational guidance.

### Bambu Studio crashes when connecting to the camera

_Source: <https://wiki.bambulab.com/en/x1/troubleshooting/bambu-studio-crashes-when-watching-online-video>_

#### Phenomenon

Every time you connect the camera in Bambu Studio to watch online videos, the software crashes and freezes.

![](https://wiki.bambulab.com/x1/troubleshooting/bambu-studio-crash/bambu_studio%E5%8D%A1%E6%AD%BB%E5%B4%A9%E6%BA%83.png)

#### Cause of the problem

Currently, Bambu Studio is not very compatible with multi-GPU laptops, so sometimes you will encounter this problem. We are also continuously working on optimizing the software.

#### Solution

This can be temporarily resolved by setting Bambu Studio's graphics processor to **Integrated Graphics** in the **Nvidia Control Panel.**

You need to do the following through the Nvidia control panel, if your laptop does not have the Nvidia control panel, you need to go to the Nvidia official website to download and install the driver for the relevant graphics card: [https://www.nvidia.cn/Download/find.aspx](https://www.nvidia.cn/Download/find.aspx)

1. Open Nvidia settings:

![](https://wiki.bambulab.com/x1/troubleshooting/bambu-studio-crash/%E7%82%B9%E5%87%BBnvidia_en.png.jpg)

2. Go to "Manage 3D Settings", where you can usually see that the preferred graphics processor is "Auto-select".

![](https://wiki.bambulab.com/x1/troubleshooting/bambu-studio-crash/%E7%AE%A1%E7%90%863d%E8%AE%BE%E7%BD%AE%E8%8B%B1%E6%96%87%E7%95%8C%E9%9D%A2.png)

3. Click into "Program Settings", add Bambu studio to "Select a program to customize", then set the preferred graphics processor to "Integrated graphics" and apply it.

![](https://wiki.bambulab.com/x1/troubleshooting/bambu-studio-crash/bambu_studio%E8%AE%BE%E7%BD%AE%E4%B8%BA%E9%9B%86%E6%88%90%E5%9B%BE%E5%BD%A2_en.png)

4. Then restart Bambu studio and you should be able to connect to the camera and watch the video normally now. If you still have problems, please create a ticket to contact the after-sales team.

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [Technical ticket](https://bambulab.com/en/my/support/tickets) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.

### Bambu Studio does not load on Windows

_Source: <https://wiki.bambulab.com/en/x1/troubleshooting/studio-not-loading-windows>_

There are some cases where Bambu Lab does not load correctly on Windows. This issue is caused by Windows Media Player feature not being enabled, and it's mostly present for Windows N versions.

Here's how to solve this problem.

#### Navigate to Windows Media Player support page

Open up the [Windows Media Player support page](https://support.microsoft.com/en-au/windows/get-windows-media-player-81718e0d-cfce-25b1-aee3-94596b658287)

#### Enable the Windows Media Player feature

To enable Windows Media Player in WIndows, select the **Start button**, then select **Settings** > **Apps** > **Apps & features** > **Manage optional features** > **Add a feature** > **Windows Media Player**, and select **Install**.

You can also click on the Enable Windows Media Player on that page, which will open the following screen. Click on **Add a feature**

![](https://wiki.bambulab.com/x1/troubleshooting/studio-not-loading-windows/add_a_feature.png)

In the next window, look for *media*that will show the Windows Media Player feature. Select it, click install, and wait for it to be enabled.

![](https://wiki.bambulab.com/x1/troubleshooting/studio-not-loading-windows/scr-20220726-ba5-2.png)

#### **Corrupted configuration files**

##### **Bambu Studio GUl initialization failed**

This failure may be caused by a corrupted configuration file.

You can quickly solve the problem by [simply downloading and executing this file](https://wiki.bambulab.com/software/fix-bambu-studio.bat). It will automatically back up the old config file and allow you to start Bambu Studio.

To manually delete the Bambu Studio config file:
Navigate to **C:\Users\user.name\AppData\Roaming\BambuStudio**, delete the **BambuStudio.conf** and **system**directory, and open Bambu Studio again.

![](https://wiki.bambulab.com/bambu-studio/trouble/output.png)

#### Reboot the computer

After the installation process is complete, reboot your machine, and Bambu Studio should load correctly.

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [Technical ticket](https://bambulab.com/en/my/support/tickets?from=5) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.

### Camera Feed Trouble Shooting

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/faq/live-view>_

#### See what happened to you!

Below is a list of common issues you may encounter while using Studio to play videos. Identify the problems you encounter and try to follow the instructions provided to resolve them.

##### Problem 1 - Initialization failed(XXX)!

![video_init_fialed.png](https://wiki.bambulab.com/software/bambu-studio/live-view/video_init_failed.png)

Failed to search the printer's video tunnel from the Bambu server. The following issues may cause this problem:

- You have not selected any printer. (No Device)
- Your printer has no camera devices. (No Camera Device)
- Your printer is in Lan Only mode. (Not supported with LAN-only mode)
- The server is not available or in an error state. Please check the network connectivity before seeking after-sales help. (Network unreachable)
- Your printer supports only Lan Direct connection, but Bambu Studio can't find the Lan IP of your printer. Please turn off your network firewall of your computer and restart Bambu Studio to retry. (Missing LAN ip of printer)
- You have logged out from the printer, and Bambu Studio is out of this information. When trying to start live viewing, the server reports the error.
- Your printer is in Lan Only mode, and Bambu Studio is out of this information.

##### Problem 2 - Windows Media Player is required for this task! (Windows Only)

On the Windows system, Windows Media Player is used to play video streams from the printer. If Windows Media Player is not available on your PC, you will encounter an error dialog when attempting to start live viewing.

![video_wmp.png](https://wiki.bambulab.com/software/bambu-studio/live-view/video_wmp.png)

Please press "OK" on the dialog, and it will take you to the "Windows Optional Features" menu. From there, you can search for and install Windows Media Player.

![install_wmp.png](https://wiki.bambulab.com/software/bambu-studio/live-view/install_wmp.png)

After installing Windows Media Player, please restart BambuStudio.
If the error persists even after installing Windows Media Player, certain Windows Updates may be blocking the functionality of Windows Media Player. In such cases, please install the available Windows Updates and restart your computer. After the restart, try running BambuStudio again.

If the installation fails using the above method, you can also try installing the Windows Media Player offline package.

- Click [here](https://wiki.bambulab.com/software/bambu-studio/live-view/microsoft-windows-mediaplayer-package-31bf3856ad364e35-amd64.zip) to download the file.
- Unzip to disk C:\
- Run the command line in Powershell to install it

`Dism.exe /Online /Add-Package /PackagePath:C:\Microsoft-Windows-MediaPlayer-Package~31bf3856ad364e35~amd64~~.cab`

##### Problem 3 - BambuSource has not correctly been registered for media playing! (Windows Only)

![bambu_sourece_register.png](https://wiki.bambulab.com/software/bambu-studio/live-view/bambu_sourece_register.png)

![bambu_sourece_register2.png](https://wiki.bambulab.com/software/bambu-studio/live-view/bambu_sourece_register2.png)

To enable compatibility with Windows Media Player, we have included a DirectShow component called 'BambuSource' in the network plugin package.

BambuSource must be registered to function properly. The component may fail to work due to the following issues:

- Registration failure    Interference from overly sensitive antivirus software
- Incorrect registration location   Registration under a different Windows user account than the one in use

WHAT TO DO:

- Re-register BambuSource according to the prompt.
- If registration fails again, consider manually importing the regedit project.   a. Download the file "bambusource.reg", below.   b. Open the file and replace 'Administrator' with your Windows account name. Save the file.   c. Merge the file into the system registry by double-clicking it.

[bambusource.reg](https://wiki.bambulab.com/software/bambu-studio/live-view/bambusource.reg)

[bambu.reg](https://wiki.bambulab.com/software/bambu-studio/live-view/bambu.reg)

##### Problem 4 - Missing BambuSource component registered for media playing! (Windows Only)

![video_dll.png](https://wiki.bambulab.com/software/bambu-studio/live-view/video_dll.png)

The BambuSource.dll been removed by yourself or other software. Often isolated by antivirus software

Check existence of BambuSource.dll
Locate BambuSource.dll in folder C:\Users\<user>\AppData\Roaming\BambuStudio\plugins.

Simply a re-installing of Bambu Studio will solve the problem.
When reinstalling, take notice of antivirus software warnings, and ignore these warnings manually.

##### Problem 5 - Load failed[###]!

![video_load_failed.png](https://wiki.bambulab.com/software/bambu-studio/live-view/video_load_failed.png)

The failure to load video streams from the printer could be due to an issue on the printer device side or a problem with Windows Media Player.
On the printer side, there may be:

- The printer is not online, and can't serve the video stream.
- The printer is in Lan Only mode and is not connected to the network.
- The printer has exceeded the service capacity limit.   On the player side, there may be:
- Windows Media Player is not installed.
- Windows Media Player is corrupt, a reinstall is needed.
- Missing BambuSource component registered for media playing.

##### Problem 6 - The program hung when loading the video stream! (Windows Only)

![video_hung.png](https://wiki.bambulab.com/software/bambu-studio/live-view/video_hung.png)

Windows Media Player utilizes the d3d9 driver for media rendering.
However, there are compatibility issues between d3d9 and certain video cards in dual-image card systems. To resolve this problem, try switching to a different video card. You can do this by configuring the image card used by Bambu Studio in the NVIDIA Control Panel.

![](https://wiki.bambulab.com/software/bambu-studio/live-view/nvidia_setting.png)

If the NVIDIA Control Panel is not available on your system, you can also modify the settings from the Windows graphics settings.

![](https://wiki.bambulab.com/software/bambu-studio/live-view/graphic_setting.png)

#### Appendix: Error codes

- Check player (Windows System Only)

| Code | Problem | Solution |
| --- | --- | --- |
| 100 | Windows Media Player is not installed | Install Windows Media Player in 'Windows Optional Features' according to the prompt. |
| 101 | BambuSource is not registered | Re-register according to the prompt. If registration fails again, it is recommended to manually import the regedit project |
| 102 | BambuSource is not registered | Re-register according to the prompt. If registration fails again, it is recommended to manually import the regedit project |
| 103 | The playback plugin is missing or the location is inconsistent (possibly because multiple Studio versions are installed and the plugins are in different directories). | Follow the prompts to re-register BambuSource or reinstall Bambu Studio. |

- Connecting via P2P (Remote)

| Code | Problem | Solution |
| --- | --- | --- |
| -90 | The printer is not really online | Please try to reboot the printer. Check printer's connectivity and retry. |
| -48 | The printer has exceeded the service capacity limit | Check if there are too many video connections to the printer |
| -10 | Certificate error | Check if you are using the official version of Bambu Studio |
| -68 | Wrong password | Check if you are using the official version of Bambu Studio |
| -13 | Connection timed out | Check the network, restart the device, and try again later |

- Connecting via LAN (Windows System Only)

| Code | Problem | Solution |
| --- | --- | --- |
| -10051 | Something wrong with your LAN network (Attempted a socket operation to an unreachable network.) | Check the network connectivity before seeking after-sales help |
| -10060 | Something wrong with your LAN network (The connection attempt failed because the connecting party did not respond correctly after a period of time or the connected host did not respond.) | Check the network connectivity before seeking after-sales help |
| -10061 | Something wrong with your LAN network (Unable to connect because the target computer actively refused.) | Check the network connectivity before seeking after-sales help |

- Connecting via LAN (Unix System Only (MacOS, Linux))

| Code | Problem | Solution |
| --- | --- | --- |
| -110 | Something wrong with the LAN network | Check the network connectivity before seeking after-sales help |
| -111 | Something wrong with the LAN network | Check the network connectivity before seeking after-sales help |
| -112 | Something wrong with the LAN network | Check the network connectivity before seeking after-sales help |

- Common Loading Video

| Code | Problem | Solution |
| --- | --- | --- |
| -1 | Something wrong with the your network | Check the network, restart the device, and try again later |
| -4 | The connection is successful, but data timed out | Check the network, restart the device, and try again later |
| 1 | Over limit studio/handy are using remote access | Close some and try again |
| 2 | Something wrong with Windows Media Player | Reinstall Windows Media Player and retry |
| 3 | Connection Failed. | Please check the network and try again |

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [Technical ticket](https://bambulab.com/en/my/support/tickets?from=5) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.

### Bambu Studio crashes/freezes troubleshooting guide

_Source: <https://wiki.bambulab.com/en/bambu-studio/troubleshoot/crash-freeze-issue>_

This article describes how to handle crash and freeze problems on various operating system platforms.

#### Windows Platform

##### Crash problem

- Simple method

On the Windows platform, we will record dump information in the log directory of the application. Please attach the * .dmp files when reporting a crash issue.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/screenshot-20230907-094745.png)

- Other method

You can use the same non-install version of Bambu Studio from [Releases · bambulab/BambuStudio](https://github.com/bambulab/BambuStudio/releases)

For example, the non-install version of v1.7.4.52 is like this(please make sure to use the same version as your installed one)

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/non_install_version.png)

After this issue is reproduced by using the non-install version, please help to send the following logs to us for our debugging:

- *.dmp
- crash_xxx.log
- debug_xxx.log.n
- debug*network*xxx.log

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/crash_files.jpg)

##### Freeze Problem

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/screenshot-20230907-095441.png)

When the application no longer responds to user actions, especially when an unresponsive pop-up dialog appears, please use the following steps to obtain dump information.

- Open Windows Task Manager
- Find the Bambu Studio process
- Select Export Dump File from the right-click context menu
- Compress the dump file and send it to us via a shared cloud storage (sometimes the file is very large, about 2GB)

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/20230907-095625.jpg)

#### macOS Platform

##### Crash problem

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/crash.png)

On macOS, your crash dumps are automatically handled by Crash Reporter.

You can save the text to a file and send it to us for analysis.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/crashreport.png)

You can also find crash reports by executing Console and going to the Crash Reports group.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/crashreportinconsole.png)

Or you can locate them in ~/Library/Logs/DiagnosticReports. Please attach the * .ips files when reporting a crash issue.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/crashreportfiles.png)

##### Freeze Problem

When the application no longer responds to user actions, especially when an unresponsive pop-up dialog appears, you can force Bambu Studio to close. Diagnose Reporter will create diagnose dumps.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/forcequit.png)

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/quit.png)

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/hang.png)

You can save the text to a file and send it to us for analysis.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/hangreport.png)

You can also find diagnostic reports by executing Console and going to the Diagnostic Reports group.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/hangreportincosole.png)

Or you can locate them in ~/Library/Logs/DiagnosticReports. Please attach the * .diag files when reporting a freeze issue.

![](https://wiki.bambulab.com/software/bambu-studio/crash_issues/hangdiagfiles.png)

If the crash report is not generated on your machine, please follow the steps below to open the crash report settings:

Execute on the command terminal

`1\. defaults write com.apple.CrashReporter DialogType developer`

`Set crash reporter`

`2\. defaults read com.apple.CrashReporter`

`Read crash reporter and make sure it is set to developer`

Then restart the machine, and the crash report will be automatically generated the next time the software crashes.

#### Linux Platform

##### Crash problem

On the Linux platform, when you encounter a crash problem with Bambu Studio, you need to debug Bambu Studio through gdb.

When debugging with gdb, you need to find a way to reproduce the crash problem. The steps to debug with gdb are:

- Run gdb BambuStudio_xxxx_yyy. AppImage
- Enter the run command in gdb
- After the application crashes, run the bt command in gdb
- Save all output in gdb execution to file and send it to us

##### Freeze Problem

When the application no longer responds to user actions, especially when an unresponsive pop-up dialog appears, you can debug Bambu Studio through gdb.

The steps to debug with gdb are:

- Run gdb BambuStudio_xxxx_yyy. AppImage --pid ,  represents the id of the process
- Press Ctrl + C
- run the bt command in gdb
- Save all output in gdb execution to file and send it to us

### Bambu Studio login and binding printer troubleshooting

_Source: <https://wiki.bambulab.com/en/bambu-studio/troubleshoot/login-binding-issue>_

#### Binding printer failed in non lan only mode

##### Information in the window when binding fails

![](https://wiki.bambulab.com/bind-issue/screenshot-20230901-113000.png)

- Error code   - This is a four-digit error code that corresponds to different errors and needs to be referenced with an error mapping table for interpretation.
- Error desc   - Regarding this error, the description will include specific details about the error, such as a binding timeout or a network error.
- Extra info   - It will include some specific error codes, such as "IOT_ERROR_NO_VALID_DEVICE," which indicates that the device’s serial number has not been registered.

##### Binding failure caused by network reasons

If the Error Description or Extra Information indicates connection failures, inability to connect, or similar errors related to connectivity, it is highly likely due to network issues.

- First, check if your network is working properly and if you can connect to the internet normally.
- If there are no issues with the network you are using, please check if the printer's network is functioning properly. You can use the cmd tool to ping your printer IP address.   （The IP of the printer can be obtained on the printer's screen.）      （P1P/P1S）

![](https://wiki.bambulab.com/bind-issue/case5-3.png)

（X1/X1C）

![](https://wiki.bambulab.com/bind-issue/screenshot-20230901-141846.png)

- If the latency is very high or you cannot ping the printer's IP address, please check your network.

![](https://wiki.bambulab.com/bind-issue/20230901-142352.jpg)

##### Error code

| **code** | **explain** | **possible causes of the Issue** | **specific inspection methods** |
| --- | --- | --- | --- |
| -1010 | failed to create socket | Connection Issues with the Printer | Check if there are any issues with the network your printer is using and the network used by Studio |
| -1020 | failed to socket connect | Connection Issues with the Printer | Check if there are any issues with the network your printer is using and the network used by Studio |
| -1030 | failed to publish login request | Network Connection Issues with the Cloud Server | Please click “Check the status of current system services” button above the error code to jump to our server tools page If your network and our cloud service are both functioning properly, please check your firewall settings. Move the printer closer to the hotspot. |
| -1040 | timeout to get ticket from printer | Network Connection Issues with the Cloud Server |
| -1050 | timeout to get ticket from cloud server | Network Connection Issues with the Cloud Server |
| -1060 | failed to post ticket to cloud server | Network Connection Issues with the Cloud Server |
| -1070 | failed to parse login report reason / no error code | Connection Issues with the Printer | Check if there are any issues with the network your printer is using and the network used by Studio |
| -1080 | failed to parse login report reason / has error code | Connection Issues with the Printer | Check if there are any issues with the network your printer is using and the network used by Studio |
| -1090 | timeout to receive login report | Connection Issues with the Printer | Check if there are any issues with the network your printer is using and the network used by Studio |

#### Binding printer failed in lan only mode

- The difference between lan only mode and non lan mode is that it does not access our cloud services.
- If LAN only mode login to the printer fails, please check if your printer and studio are on the same LAN.

#### Binding using an APP

- Try binding a printer using our app, please refer to the Wiki [Bambu Handy Quick Start Guide](https://wiki.bambulab.com/en/studio-handy/handy/bambu-handy-quick-start)
- Download link [Software APP - Bambu Lab](https://bambulab.com/en-us/download/app)

#### End Notes

> We hope that the detailed guide we shared with you was helpful and informative.
>
> We want to ensure that you can perform it safely and effectively. If you have any concerns or questions regarding the process described in this article, we encourage you to reach out to our friendly customer service team before starting the operation. Our team is always ready to help you and answer any questions you may have.
>
> [Click here to open a new ticket in our Support Page](https://bambulab.com/en/my/support/tickets?from=5).
>
> We will do our best to respond promptly and provide you with the assistance you need.

### Slicing crashed on Windows troubleshooting

_Source: <https://wiki.bambulab.com/en/bambu-studio/troubleshoot/win-crash-when-slicing>_

#### What the issue is

When editing a .3mf file in Bambu Studio on Windows operating systems, Bambu Studio occationally crashes during slicing either after switching to the **Preview** tab, or clicking **Slice all** or **Slice plate**.

#### GPU Thread Optimization Issue

If your computer uses an NVIDIA GPU, its multi-threaded optimization may cause Bambu Studio to crash during the slicing process. You can disable it using the following method.

In the NVIDIA Control Panel, go to **3D Settings → Manage 3D Settings → Program Settings**, and add Bambu Studio to the program list (if it’s not already there). Find the setting named **Threaded Optimization** and turn it **Off**.

![en.jpg](https://wiki.bambulab.com/software/bambu-studio/en.jpg)

> If you cannot find the NVIDIA Control Panel on your computer, you can download and install it via the [Microsoft Store](https://apps.microsoft.com/detail/9nf8h0h7wmlt?hl=zh-TW&gl=TW), or update the latest drivers from the [official NVIDIA website](https://www.nvidia.com/en-us/drivers/).

#### Multithreading Instability Due to CPU Overclocking

This may be caused by instability in the CPU's multithreading due to overclocking. Choose a solution below based on your situation.

##### Solution 1

Step 1. Press Ctrl + Shift + Escape to open Task Manager.

Step 2. Click the **Details** tab.

![](https://wiki.bambulab.com/bambu-studio/troubleshoot/win-crash-when-slicing/details.jpg)

Step 3. Locate bambu-studio.exe, and then right-click it and select **Set affinity**.

![](https://wiki.bambulab.com/bambu-studio/troubleshoot/win-crash-when-slicing/set_affinity.jpg)

Step 4. On the pop-up window, deselect **<All Processors>**, and then only select a couple of options. For example, CPU 0 to CPU 3, or CPU 0 to CPU 7.

![](https://wiki.bambulab.com/bambu-studio/troubleshoot/win-crash-when-slicing/processor_affinity.jpg)

Step 5. Click **OK**. Try slicing in Bambu Studio and see if it will crash again.

##### Solution 2 (applicable to Intel processors)

Step 1. Download and install Intel® Extreme Tuning Utility.

Step 2. Select **Advanced Tuning > Benchmarking**.

Step 3. Adjust all the options to **54x** in the **Performance Active-Core Tuning**, and then click **Apply**.

![](https://wiki.bambulab.com/bambu-studio/troubleshoot/win-crash-when-slicing/%E6%94%B9%E4%B8%BA54.png)

Step 4. Try slicing in Bambu Studio and see if it will crash again.

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [Technical ticket](https://bambulab.com/en/my/support/tickets?from=5) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.

### Bambu Lab Account Two-Factor Authentication / 2FA

_Source: <https://wiki.bambulab.com/en/studio-handy/account-multifactor-authentication>_

At Bambu Lab, we place great emphasis on securing user data. For user accounts, we offer Two-Factor authentication and have introduced a new verification mechanism under specific conditions. We provide robust, layered methods to protect user data and the app from security threats.

In this article, we will delve into the security authentication features of Bambu accounts.

#### What is Two-Factor Authentication (2FA) / Multi-Factor Authentication (MFA)

Multi-factor authentication (MFA) is a security method that requires users to verify their identity in two or more ways before accessing an account. Each "factor" comes from a different category, like something you know (password), something you have (a phone), or something you are (fingerprint).

Two-factor authentication (2FA) is a common type of MFA. With 2FA, you confirm your identity with two steps. For example, after entering a password, you may also need to enter a code sent to your email/phone.

MFA and 2FA make accounts more secure because, even if someone knows your password, they would also need access to your second factor, like your phone or fingerprint, to log in. This makes it much harder for hackers to break into accounts.

#### How MFA and 2FA works in Bambu Lab Accounts?

For a Bambu Lab account, two-factor authentication (2FA) works by sending a unique verification code to the user's registered email address. When you log in to services like the Bambu Handy app, MakerWorld, or any other Bambu Lab platform, you start by entering your email address and password as usual.

![](https://wiki.bambulab.com/bambu-handy/mfa/login.jpg)

Once you've entered your credentials, Bambu Lab sends a 6 digit verification code to your email. You then need to open your email, find the code, and enter it in the app or website. Only after entering this code correctly can you access your account.

![](https://wiki.bambulab.com/bambu-handy/mfa/email_verification_code.png)

![](https://wiki.bambulab.com/bambu-handy/mfa/mfa_code.png)

This extra step ensures that, even if someone knows your password, they would also need access to your email account to log in successfully, making it much harder for unauthorized users to access your Bambu Lab account.

#### How to enable 2FA in your Bambu Lab Account?

To keep your account secure, it is very important to enable the 2FA function in your Bambu Lab profile. Please follow the steps below to enable it:

1. Click on your [User Account → Profile Settings](https://bambulab.com/u/profile-setting).
2. Enable 2-Step Verification.

Once the setting is turned on, you will be asked to verify your password again, to ensure you are the owner of the account before enabling the feature. Enter it, then you will be taken to the next step

![](https://wiki.bambulab.com/bambu-handy/mfa/account_pass_verification.png)

In the next step, you will be asked to designate a name for your device for which you are configuring the multi-factor authentication. In this case, *Main Computer* was used.
Enter a name which is easy to remember, then click Go on.

![](https://wiki.bambulab.com/bambu-handy/mfa/2fa_device.png)

Now it's time to scan the QR code and add the account to your Authenticator app. If you don't have one already, we recommend using Duo Mobile or Google Authenticator.
Simply scan it to the app, and you will always have access to the 6 digit verification code required to login.

![](https://wiki.bambulab.com/bambu-handy/mfa/scan_qr_code.png)

Once scanned and added to the authenticator app, you will be asked to enter the code displayed in the app to verify it.
Simply add the OTP code, and click **Confirm**.

![](https://wiki.bambulab.com/bambu-handy/mfa/otp_code.png)

Your account is now protected, shown by the notification message and the status of the button in your profile.

![](https://wiki.bambulab.com/bambu-handy/mfa/2fa_enabled.png)

#### Verification Mechanism

##### Trigger Conditions

To trigger this additional verification, the following three conditions must be met simultaneously during login:

1. The account **does not have two-step authentication enabled**.
2. Logging into the account for the first time on a new device.
3. Using **account credentials** for login (not a third-party login method).

##### Trigger Process

###### Logging in from Bambu Handy

If Bambu Handy is not updated to **V2.15.5** and all three conditions mentioned above are met, the following prompt will appear in Bambu Handy. Please update Bambu Handy to **V2.15.5** or **a higher version** and then log in again.

![old_handy_version.png](https://wiki.bambulab.com/bambu-handy/mfa/old_handy_version.png)

Once Bambu Handy has been updated to V2.15.5 or a later version, under the conditions mentioned above, when logging in with your account credentials, we will send a 6-digit verification code to your email. Locate the code in your email and input it to log into your account.

![login.jpg](https://wiki.bambulab.com/bambu-handy/mfa/login.jpg)

![mfa_code.png](https://wiki.bambulab.com/bambu-handy/mfa/mfa_code.png)

![email_verification_code.png](https://wiki.bambulab.com/bambu-handy/mfa/email_verification_code.png)

###### Logging in from Bambu Studio or the website

Under these three conditions, logging into your account from Bambu Studio or the website will also undergo this additional verification process.

![website1.jpg](https://wiki.bambulab.com/bambu-handy/mfa/website1.jpg)

![website2.jpg](https://wiki.bambulab.com/bambu-handy/mfa/website2.jpg)

#### What to do if you lose access to your Email account?

If you lose access to the email associated with your Bambu Lab account, you’ll need to [contact Bambu Lab customer support](https://bambulab.com/en/my/support/tickets?from=5) for help. You will be asked to provide specific identification details to verify your identity, such as:

1. Information about a recent order (like the order number or details of purchased items).
2. The serial number (SN) of your Bambu Lab printer.
3. Other information which can verify your account.

Once you provide these details, customer support can assist you in regaining access to your account or updating your email.

#### End Notes

> We hope the detailed guide provided has been helpful and informative.
>
> To ensure a safe and effective execution, if you have any concerns or questions about the process described in this article, we recommend submitting a [technical ticket](https://bambulab.com/en/my/support/tickets?from=5) regarding your issue. Please include a picture or video illustrating the problem, as well as any additional information related to your inquiry.


## Release Notes

### Bambu Studio Release Notes

_Source: <https://wiki.bambulab.com/en/software/bambu-studio/release>_

[Bambu Studio 2.7.1.62](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-7-1-62)

[Bambu Studio 2.7.1](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-7-1)

[Bambu Studio 2.6.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-6-0)

[Bambu Studio 2.5.3](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-5-3)

[Bambu Studio 2.5.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-5-0)

[Bambu Studio v2.4.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-4-0)

[Bambu Studio v2.3.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-3-0)

[Bambu Studio v2.2.1.60](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-2-1-60)

[Bambu Studio v2.2.1](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-2-1)

[Bambu Studio v2.2.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-2-0)

[Bambu Studio v2.1.1](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-1-1)

[Bambu Studio v2.1.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-1-0)

[Bambu Studio v2.0.3](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-0-3)

[Bambu Studio v2.0.2](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-0-2)

[Bambu Studio v2.0.1](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-0-1)

[Bambu Studio v2.0.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-2-0-0)

[Bambu Studio v1.10.2](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-10-2)

[Bambu Studio v1.10.1](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-10-1)

[Bambu Studio v1.10.0](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-10-0)

---

Click here to view release notes for previous versions

[Bambu Studio v1.9.7](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-9-7)

[Bambu Studio v1.9.5](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-9-5)

[Bambu Studio v1.9.4](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-9-4)

[Bambu Studio v1.9.3](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-9-3)

[Bambu Studio v1.9.2](https://wiki.bambulab.com/en/software/bambu-studio/release/1-9-2)

[Bambu Studio v1.9.1](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-9-1)

[Bambu Studio v1.8.4](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-8-4)

[Bambu Studio v1.8.2](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-8-2)

[Bambu Studio v1.7.7.89](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-7-89)

[Bambu Studio v1.7.7](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-7)

[Bambu Studio v1.7.6](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-6)

[Bambu Studio v1.7.4](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-4)

[Bambu Studio v1.7.3](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-3)

[Bambu Studio v1.7.2](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7-2)

[Bambu Studio v1.7](https://wiki.bambulab.com/en/software/bambu-studio/release/release-note-1-7)

For previous release notes, please check our [GitHub repository release page](https://github.com/bambulab/BambuStudio/releases).
