bool OBSBasic::ReorderFreeMixInputs(obs_data_array_t *keys)
{
	if (!keys || obs_data_array_count(keys) != size_t(ui->scenes->count())) return false;
	OBSDataArrayAutoRelease order = obs_data_array_create();
	std::set<std::string> seen;
	for (size_t n = 0; n < obs_data_array_count(keys); n++) {
		OBSDataAutoRelease value = obs_data_array_item(keys, n);
		const std::string uuid = obs_data_get_string(value, "uuid");
		OBSSourceAutoRelease source = obs_get_source_by_uuid(uuid.c_str());
		if (!source || !obs_scene_from_source(source) || !seen.insert(uuid).second) return false;
		const char *name = obs_source_get_name(source);
		if (ui->scenes->findItems(QT_UTF8(name), Qt::MatchExactly).size() != 1) return false;
		OBSDataAutoRelease item = obs_data_create();
		obs_data_set_string(item, "name", name);
		obs_data_array_push_back(order, item);
	}
	QListWidgetItem *selected = ui->scenes->currentItem();
	{
		QSignalBlocker blocker(ui->scenes);
		LoadSceneListOrder(order);
		ui->scenes->setCurrentItem(selected);
	}
	SaveProject();
	OnEvent(OBS_FRONTEND_EVENT_SCENE_LIST_CHANGED);
	return true;
}

